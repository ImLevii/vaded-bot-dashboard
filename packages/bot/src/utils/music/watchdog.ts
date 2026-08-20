import type { Rainlink } from 'rainlink'
import type { Client, Guild, VoiceChannel } from 'discord.js'
import { ChannelType } from 'discord.js'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'
import { parseIntEnv } from '@lucky/shared/utils/env'
import { musicSessionSnapshotService } from './sessionSnapshots'
import type { RainlinkQueueAdapter } from './rainlinkAdapter'
import { wrapPlayer } from './rainlinkAdapter'

export type RecoveryAction =
    'none' | 'rejoin' | 'requeue_current' | 'play_next' | 'failed'

export type WatchdogGuildState = {
    guildId: string
    timeoutMs: number
    lastActivityAt: number | null
    lastRecoveryAt: number | null
    lastRecoveryAction: RecoveryAction
    lastRecoveryDetail: string | null
}

const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1_000

type MusicWatchdogOptions = {
    timeoutMs?: number
    recoveryWaitTimeoutMs?: number
    recoveryPollIntervalMs?: number
    scanIntervalMs?: number
}

export class MusicWatchdogService {
    private readonly timeoutMs: number
    private readonly recoveryWaitTimeoutMs: number
    private readonly recoveryPollIntervalMs: number
    private readonly scanIntervalMs: number
    private scanTimer: ReturnType<typeof setInterval> | null = null
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly states = new Map<string, WatchdogGuildState>()
    private readonly intentionalStops = new Set<string>()
    private orphanMonitorInterval: ReturnType<typeof setInterval> | null = null

    constructor(options: MusicWatchdogOptions = {}) {
        this.timeoutMs =
            options.timeoutMs ?? parseIntEnv('MUSIC_WATCHDOG_TIMEOUT_MS', 25000)
        this.recoveryWaitTimeoutMs =
            options.recoveryWaitTimeoutMs ??
            parseIntEnv('MUSIC_WATCHDOG_RECOVERY_WAIT_MS', 5000)
        this.recoveryPollIntervalMs =
            options.recoveryPollIntervalMs ??
            parseIntEnv('MUSIC_WATCHDOG_RECOVERY_POLL_MS', 100)
        this.scanIntervalMs =
            options.scanIntervalMs ??
            parseIntEnv('MUSIC_WATCHDOG_SCAN_INTERVAL_MS', 60000)
    }

    private ensureState(guildId: string): WatchdogGuildState {
        const existing = this.states.get(guildId)
        if (existing) return existing
        const created: WatchdogGuildState = {
            guildId,
            timeoutMs: this.timeoutMs,
            lastActivityAt: null,
            lastRecoveryAt: null,
            lastRecoveryAction: 'none',
            lastRecoveryDetail: null,
        }
        this.states.set(guildId, created)
        return created
    }

    private async waitForVoiceReady(
        queue: RainlinkQueueAdapter,
    ): Promise<boolean> {
        if (queue.isVoiceConnected) return true

        const deadline = Date.now() + this.recoveryWaitTimeoutMs
        while (Date.now() < deadline) {
            await new Promise((resolve) =>
                setTimeout(resolve, this.recoveryPollIntervalMs),
            )

            if (queue.isVoiceConnected) return true
        }

        return queue.isVoiceConnected
    }

    touch(guildId: string, now = Date.now()): void {
        const state = this.ensureState(guildId)
        state.lastActivityAt = now
    }

    /**
     * Flags a teardown as deliberate so neither checkAndRecover nor the orphan
     * scan undoes it. Pair it with
     * `musicSessionSnapshotService.deleteSnapshot(guildId)`: this flag only
     * lasts `timeoutMs + 10s`, so a surviving snapshot is picked up by a later
     * sweep and the session the user ended comes back.
     */
    markIntentionalStop(guildId: string): void {
        this.intentionalStops.add(guildId)
        this.clear(guildId)
        // Window must outlive the watchdog timeout so the flag is still set
        // when any already-scheduled checkAndRecover fires.
        setTimeout(
            () => this.intentionalStops.delete(guildId),
            this.timeoutMs + 10_000,
        )
    }

    isIntentionalStop(guildId: string): boolean {
        return this.intentionalStops.has(guildId)
    }

    clear(guildId: string): void {
        const timer = this.timers.get(guildId)
        if (timer) {
            clearTimeout(timer)
            this.timers.delete(guildId)
        }
    }

    arm(queue: RainlinkQueueAdapter): void {
        const guildId = queue.guild.id
        this.clear(guildId)
        this.touch(guildId)

        const timer = setTimeout(() => {
            void this.checkAndRecover(queue)
        }, this.timeoutMs)
        this.timers.set(guildId, timer)
    }

    /**
     * Why the watchdog should keep its hands off a queue, or null to proceed.
     * Paused counts as live: isPlaying() is false while paused, so without it a
     * pause read as a stall and the watchdog resumed playback seconds after the
     * user deliberately stopped it.
     */
    private skipRecoveryReason(queue: RainlinkQueueAdapter): string | null {
        if (this.intentionalStops.has(queue.guild.id)) return 'intentional_stop'
        if (queue.node.isPlaying()) return 'queue_playing'
        if (queue.node.isPaused()) return 'queue_paused'
        return null
    }

    /** Rejoins if needed (twice before giving up). `failure` is a state detail. */
    private async ensureConnectionReady(
        queue: RainlinkQueueAdapter,
    ): Promise<{ rejoined: boolean; failure: string | null }> {
        if (queue.isVoiceConnected) {
            return { rejoined: false, failure: null }
        }

        await queue.rejoinVoice()
        if (!(await this.waitForVoiceReady(queue))) {
            await queue.rejoinVoice()
            if (!(await this.waitForVoiceReady(queue))) {
                return {
                    rejoined: true,
                    failure: 'connection_not_ready_after_rejoin_retry',
                }
            }
        }

        if (!queue.isVoiceConnected) {
            return {
                rejoined: true,
                failure: 'connection_not_ready_after_rejoin',
            }
        }

        return { rejoined: true, failure: null }
    }

    async checkAndRecover(
        queue: RainlinkQueueAdapter,
    ): Promise<RecoveryAction> {
        const guildId = queue.guild.id
        const state = this.ensureState(guildId)

        const skipReason = this.skipRecoveryReason(queue)
        if (skipReason) {
            state.lastRecoveryAction = 'none'
            state.lastRecoveryDetail = skipReason
            return 'none'
        }

        let action: RecoveryAction = 'none'
        let detail = 'nothing_to_recover'
        try {
            const connection = await this.ensureConnectionReady(queue)
            if (connection.failure) {
                state.lastRecoveryAction = 'failed'
                state.lastRecoveryDetail = connection.failure
                state.lastRecoveryAt = Date.now()
                return 'failed'
            }

            if (queue.currentTrack) {
                await queue.node.play(queue.currentTrack)
                action = 'requeue_current'
                detail = connection.rejoined
                    ? 'rejoined_and_requeued_current'
                    : 'requeue_current'
            } else if (queue.tracks.size > 0) {
                await queue.node.play()
                action = 'play_next'
                detail = 'started_next_track'
            }
        } catch (error) {
            action = 'failed'
            detail =
                error instanceof Error
                    ? `recovery_failed:${error.message}`
                    : `recovery_failed:${String(error)}`
            errorLog({
                message: 'Music watchdog recovery failed',
                error,
                data: { guildId },
            })
        }

        state.lastRecoveryAction = action
        state.lastRecoveryDetail = detail
        state.lastRecoveryAt = Date.now()

        debugLog({
            message: 'Music watchdog recovery result',
            data: { guildId, action, detail },
        })

        return action
    }

    startOrphanSessionMonitor(
        rainlink: Rainlink,
        client: Client,
        intervalMs = 60_000,
    ): void {
        if (this.orphanMonitorInterval) return

        this.orphanMonitorInterval = setInterval(() => {
            void this.scanOrphanSessions(rainlink, client)
        }, intervalMs)

        debugLog({ message: 'Music watchdog orphan session monitor started' })
    }

    stopOrphanSessionMonitor(): void {
        if (this.orphanMonitorInterval) {
            clearInterval(this.orphanMonitorInterval)
            this.orphanMonitorInterval = null
        }
    }

    async scanOrphanSessions(
        rainlink: Rainlink,
        client: Client,
    ): Promise<void> {
        const guildIds = await musicSessionSnapshotService.listGuildIds()

        for (const guildId of guildIds) {
            try {
                await this.recoverOrphanSession(rainlink, client, guildId)
            } catch (error) {
                errorLog({
                    message: 'Watchdog orphan recovery error',
                    error,
                    data: { guildId },
                })
            }
        }
    }

    /**
     * The channel a snapshot should be rejoined into, or null when this guild
     * is not a recovery candidate at all.
     */
    private async resolveOrphanTarget(
        client: Client,
        guildId: string,
    ): Promise<{
        guild: Guild
        voiceChannel: VoiceChannel
        voiceChannelId: string
        ageMs: number
    } | null> {
        const snapshot = await musicSessionSnapshotService.getSnapshot(guildId)
        if (!snapshot) return null

        const ageMs = Date.now() - snapshot.savedAt
        if (ageMs > SNAPSHOT_MAX_AGE_MS) return null

        const guild = client.guilds.cache.get(guildId)
        if (!guild) return null

        const voiceChannelId = snapshot.voiceChannelId
        if (!voiceChannelId) return null

        const channel = guild.channels.cache.get(voiceChannelId)
        if (!channel || channel.type !== ChannelType.GuildVoice) return null

        const voiceChannel = channel as VoiceChannel
        const membersInChannel = voiceChannel.members.filter((m) => !m.user.bot)
        if (membersInChannel.size === 0) return null

        return { guild, voiceChannel, voiceChannelId, ageMs }
    }

    private async recoverOrphanSession(
        rainlink: Rainlink,
        client: Client,
        guildId: string,
    ): Promise<void> {
        // A deliberate stop is not an orphan. checkAndRecover has always
        // honoured this flag; this scan did not, so a /stop or a dashboard stop
        // was undone by the next sweep — the bot rejoined the channel it had
        // just left and resumed the session the user ended.
        if (this.intentionalStops.has(guildId)) return

        const existingPlayer = rainlink.players.get(guildId)
        const existingQueue = existingPlayer ? wrapPlayer(existingPlayer) : null
        if (existingQueue?.node.isPlaying()) return
        // Paused counts as live for the same reason it does in checkAndRecover.
        if (existingQueue?.node.isPaused()) return

        const target = await this.resolveOrphanTarget(client, guildId)
        if (!target) return
        const { guild, voiceChannelId, ageMs } = target

        infoLog({
            message: 'Watchdog detected orphan session, attempting rejoin',
            data: { guildId, voiceChannelId, snapshotAgeMs: ageMs },
        })

        const createdQueue = !existingQueue
        let queue: RainlinkQueueAdapter
        if (existingQueue) {
            queue = existingQueue
        } else {
            // rainlink connects at creation time — no separate connect() step.
            // No dedicated text channel is known from the snapshot (only
            // voiceChannelId), so the voice channel id is reused as textId;
            // most guild voice channels also support their own text chat.
            const rainlinkPlayer = await rainlink.create({
                guildId,
                textId: voiceChannelId,
                voiceId: voiceChannelId,
                shardId: guild.shardId,
            })
            queue = wrapPlayer(rainlinkPlayer)
            // Deliberately does NOT force a repeat/loop mode. It used to force
            // autoplay on regardless of the guild's setting, so when the
            // restore below found nothing, autoplay pulled the last track out
            // of history and played it — the bot rejoining an ended session
            // and replaying the song.
            //
            // skipConnectionEventRestore stops the lifecycle handler's
            // playerConnect listener from ALSO restoring this snapshot. Both
            // race otherwise: restoreSnapshot() no-ops once queue.currentTrack
            // is set, so whichever call lost the race reported restoredCount:
            // 0 here while the *other* one had already started playback.
            queue.setMetadata({ skipConnectionEventRestore: true, client })
        }

        const restoreResult = await musicSessionSnapshotService.restoreSnapshot(
            queue,
            undefined,
            { skipCurrentTrack: true },
        )
        if (!restoreResult || restoreResult.restoredCount <= 0) {
            await musicSessionSnapshotService.deleteSnapshot(guildId)
            // Nothing to play, so don't sit in the channel we just joined for
            // this. A queue that was already there is left alone.
            if (createdQueue) await queue.delete()

            const state = this.ensureState(guildId)
            state.lastRecoveryAction = 'failed'
            state.lastRecoveryAt = Date.now()
            state.lastRecoveryDetail = 'snapshot_restore_empty'

            infoLog({
                message:
                    'Watchdog orphan session restore produced no tracks; snapshot cleared',
                data: { guildId, voiceChannelId },
            })
            return
        }

        const state = this.ensureState(guildId)
        state.lastRecoveryAction = 'rejoin'
        state.lastRecoveryAt = Date.now()

        infoLog({
            message: 'Watchdog orphan session recovered',
            data: { guildId },
        })
    }

    getGuildState(guildId: string): WatchdogGuildState {
        return { ...this.ensureState(guildId) }
    }

    getAllStates(): WatchdogGuildState[] {
        return Array.from(this.states.values()).map((state) => ({ ...state }))
    }

    async scanOrphanedSessions(
        getQueue: (guildId: string) => RainlinkQueueAdapter | null,
    ): Promise<string[]> {
        const recovered: string[] = []
        try {
            const guildIds = await musicSessionSnapshotService.listGuildIds()
            for (const guildId of guildIds) {
                const queue = getQueue(guildId)
                if (!queue) continue
                if (queue.node.isPlaying()) continue
                if (this.timers.has(guildId)) continue

                debugLog({
                    message: 'Watchdog scan: arming orphaned session',
                    data: { guildId },
                })
                this.arm(queue)
                recovered.push(guildId)
            }
        } catch (error) {
            errorLog({
                message: 'Watchdog periodic scan failed',
                error,
            })
        }
        return recovered
    }

    startPeriodicScan(
        getQueue: (guildId: string) => RainlinkQueueAdapter | null,
    ): void {
        if (this.scanTimer) return

        infoLog({
            message: `Music watchdog periodic scan started (interval: ${this.scanIntervalMs}ms)`,
        })

        this.scanTimer = setInterval(() => {
            void this.scanOrphanedSessions(getQueue)
        }, this.scanIntervalMs)
    }

    stopPeriodicScan(): void {
        if (this.scanTimer) {
            clearInterval(this.scanTimer)
            this.scanTimer = null
        }
    }
}

export const musicWatchdogService = new MusicWatchdogService()
