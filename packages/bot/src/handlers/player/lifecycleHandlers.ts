import type { Rainlink, RainlinkPlayer } from 'rainlink'
import type { Client } from 'discord.js'
import { infoLog, debugLog } from '@lucky/shared/utils'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../utils/music/sessionSnapshots'
import { wrapPlayer } from '../../utils/music/rainlinkAdapter'

export const setupVoiceKickDetection = (client: Client): void => {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (newState.member?.id !== client.user?.id) return
        const wasInChannel = Boolean(oldState.channelId)
        const nowDisconnected = !newState.channelId
        if (wasInChannel && nowDisconnected && oldState.guild) {
            const guildId = oldState.guild.id
            musicWatchdogService.markIntentionalStop(guildId)
            // The playerDestroy/playerDisconnect handlers below fire *before*
            // this event when the disconnect came from Discord's side, so they
            // save a snapshot while the stop is not yet flagged. Dropping it
            // here closes that race: without it the orphan scan found a fresh
            // snapshot moments later and rejoined the channel.
            await musicSessionSnapshotService.deleteSnapshot(guildId)
            infoLog({
                message: `Bot was disconnected from voice in ${oldState.guild.name} — marked intentional`,
            })
        }
    })
}

/**
 * rainlink has no built-in "voice channel became empty" event (discord-player's
 * emptyChannel) — reimplemented here by watching voiceStateUpdate for members
 * leaving a channel the bot occupies.
 */
export const setupEmptyChannelDetection = (
    client: Client,
    rainlink: Rainlink,
): void => {
    client.on('voiceStateUpdate', async (oldState) => {
        if (!oldState.channelId || !oldState.guild) return
        const rainlinkPlayer = rainlink.players.get(oldState.guild.id)
        if (!rainlinkPlayer || rainlinkPlayer.voiceId !== oldState.channelId)
            return

        const channel = oldState.channel
        if (!channel) return
        const nonBotMembers = channel.members.filter((m) => !m.user.bot)
        if (nonBotMembers.size > 0) return

        const queue = wrapPlayer(rainlinkPlayer)
        infoLog({ message: `Channel is empty in guild ${queue.guild.id}` })
        await voiceStatus.clearStatus(queue)
        await musicSessionSnapshotService.saveSnapshot(queue)
        musicWatchdogService.clear(queue.guild.id)
    })
}

export const setupLifecycleHandlers = (player: Rainlink): void => {
    player.on('debug', (logs: string) => {
        debugLog({ message: `Player debug: ${logs}` })
    })

    // rainlink has no separate "voice connected" event — playerCreate fires
    // once the player (and its voice connection) is created.
    player.on('playerCreate', async (rainlinkPlayer: RainlinkPlayer) => {
        const queue = wrapPlayer(rainlinkPlayer)
        infoLog({
            message: `Created connection to voice channel in guild ${queue.guild.id}`,
        })
        debugLog({
            message: 'Voice connection details',
            data: {
                connected: queue.isVoiceConnected,
                voiceId: queue.voiceId,
            },
        })

        const metadata = queue.metadata
        if (
            ENVIRONMENT_CONFIG.MUSIC.SESSION_RESTORE_ENABLED &&
            !metadata?.skipConnectionEventRestore
        ) {
            // Abort the restore if the deadline wins the race, so a slow restore
            // can't keep enqueueing tracks after we've moved on with an empty queue.
            const restoreController = new AbortController()
            const restoreDeadline = new Promise<never>((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                `Session restore timed out in guild ${queue.guild.id}`,
                            ),
                        ),
                    2000,
                ),
            )

            try {
                await Promise.race([
                    musicSessionSnapshotService.restoreSnapshot(
                        queue,
                        metadata?.requestedBy ?? undefined,
                        { signal: restoreController.signal },
                    ),
                    restoreDeadline,
                ])
            } catch (error) {
                // Cancel the still-running restore so it stops before enqueuing more.
                restoreController.abort()
                infoLog({
                    message: `Snapshot restore failed, continuing with empty queue`,
                    data: {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                })
            }
        }

        musicWatchdogService.arm(queue)
    })

    // rainlink has no separate "voice disconnected" event distinct from
    // "player destroyed" — playerDestroy covers both /stop-style teardown
    // and Discord-side disconnects, so this merges what used to be two
    // discord-player handlers (connectionDestroyed + disconnect) into one.
    player.on('playerDestroy', async (rainlinkPlayer: RainlinkPlayer) => {
        const queue = wrapPlayer(rainlinkPlayer)
        infoLog({
            message: `Destroyed connection to voice channel in guild ${queue.guild.id}`,
        })

        await voiceStatus.clearStatus(queue)
        // Queue was explicitly deleted — never attempt recovery here. That
        // includes not writing the snapshot that recovery reads: on a /stop or
        // a dashboard stop this saved the queue being torn down, and the orphan
        // scan restored it a minute later.
        if (!musicWatchdogService.isIntentionalStop(queue.guild.id)) {
            await musicSessionSnapshotService.saveSnapshot(queue)
            await musicWatchdogService.checkAndRecover(queue)
        }
    })

    player.on('queueEmpty', (rainlinkPlayer: RainlinkPlayer) => {
        const queue = wrapPlayer(rainlinkPlayer)
        // Autoplay replenishment is deferred — see
        // decisions/2026-06-10-defer-autoplay-engine-extraction.md.
        musicWatchdogService.markIntentionalStop(queue.guild.id)
    })
}
