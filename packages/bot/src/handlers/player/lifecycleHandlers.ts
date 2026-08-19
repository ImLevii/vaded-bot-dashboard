import type { GuildQueue } from 'discord-player'
import type { Client } from 'discord.js'
import { infoLog, debugLog } from '@lucky/shared/utils'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../utils/music/sessionSnapshots'
import { replenishQueue } from '../../utils/music/queueOperations'
import type { QueueMetadata } from '../../types/QueueMetadata'

export const setupVoiceKickDetection = (client: Client): void => {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (newState.member?.id !== client.user?.id) return
        const wasInChannel = Boolean(oldState.channelId)
        const nowDisconnected = !newState.channelId
        if (wasInChannel && nowDisconnected && oldState.guild) {
            const guildId = oldState.guild.id
            musicWatchdogService.markIntentionalStop(guildId)
            // The connectionDestroyed/disconnect handlers below fire *before*
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

export const setupLifecycleHandlers = (player: {
    events: { on: (event: string, handler: Function) => void }
}): void => {
    player.events.on('debug', (queue: GuildQueue, message: string) => {
        debugLog({
            message: `Player debug from ${queue.guild.name}: ${message}`,
        })
    })

    player.events.on('connection', async (queue: GuildQueue) => {
        infoLog({
            message: `Created connection to voice channel in ${queue.guild.name}`,
        })

        if (queue.connection) {
            debugLog({
                message: 'Voice connection details',
                data: {
                    state: queue.connection.state?.status,
                    joinConfig: queue.connection.joinConfig,
                    ready: queue.connection.state?.status === 'ready',
                },
            })
        }

        const metadata = queue.metadata as QueueMetadata | undefined
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
                                `Session restore timed out in ${queue.guild.name}`,
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

    player.events.on('connectionDestroyed', async (queue: GuildQueue) => {
        infoLog({
            message: `Destroyed connection to voice channel in ${queue.guild.name}`,
        })

        await voiceStatus.clearStatus(queue)
        // Queue was explicitly deleted — never attempt recovery here. That
        // includes not writing the snapshot that recovery reads: on a /stop or
        // a dashboard stop this saved the queue being torn down, and the orphan
        // scan restored it a minute later.
        if (!musicWatchdogService.isIntentionalStop(queue.guild.id)) {
            await musicSessionSnapshotService.saveSnapshot(queue)
        }
    })

    player.events.on('emptyChannel', async (queue: GuildQueue) => {
        infoLog({ message: `Channel is empty in ${queue.guild.name}` })
        await voiceStatus.clearStatus(queue)
        await musicSessionSnapshotService.saveSnapshot(queue)
        musicWatchdogService.clear(queue.guild.id)
    })

    player.events.on('emptyQueue', async (queue: GuildQueue) => {
        const isAutoplayEnabled = queue.repeatMode === 3
        if (isAutoplayEnabled && queue.currentTrack) {
            await replenishQueue(queue)
        } else {
            musicWatchdogService.markIntentionalStop(queue.guild.id)
        }
    })

    player.events.on('disconnect', async (queue: GuildQueue) => {
        infoLog({
            message: `Disconnected from voice channel in ${queue.guild.name}`,
        })

        await voiceStatus.clearStatus(queue)
        if (!musicWatchdogService.isIntentionalStop(queue.guild.id)) {
            await musicSessionSnapshotService.saveSnapshot(queue)
            await musicWatchdogService.checkAndRecover(queue)
        }
    })
}
