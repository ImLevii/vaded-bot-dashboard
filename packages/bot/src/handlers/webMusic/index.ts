import type { CustomClient } from '../../types'
import {
    musicControlService,
    type MusicCommand,
    type MusicCommandResult,
} from '@lucky/shared/services'
import { infoLog, errorLog, debugLog } from '@lucky/shared/utils'
import { buildQueueState } from './mappers'
import * as playback from './commandHandlers'
import * as queue from './queueHandlers'

const commandMap: Record<
    string,
    (client: CustomClient, cmd: MusicCommand) => Promise<MusicCommandResult>
> = {
    get_state: playback.handleGetState,
    play: playback.handlePlay,
    pause: playback.handlePause,
    resume: playback.handleResume,
    skip: playback.handleSkip,
    previous: playback.handlePrevious,
    stop: playback.handleStop,
    volume: playback.handleVolume,
    shuffle: playback.handleShuffle,
    repeat: playback.handleRepeat,
    seek: playback.handleSeek,
    queue_move: queue.handleQueueMove,
    queue_remove: queue.handleQueueRemove,
    queue_clear: queue.handleQueueClear,
    import_playlist: queue.handleImportPlaylist,
}

async function handleCommand(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<MusicCommandResult> {
    try {
        const handler = commandMap[cmd.type]
        if (!handler) {
            return {
                id: cmd.id,
                guildId: cmd.guildId,
                success: false,
                error: `Unknown command: ${cmd.type}`,
                timestamp: Date.now(),
            }
        }
        return await handler(client, cmd)
    } catch (error) {
        errorLog({
            message: `Error handling web music command ${cmd.type}:`,
            error,
        })
        return {
            id: cmd.id,
            guildId: cmd.guildId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
        }
    }
}

let webMusicPublishInterval: ReturnType<typeof setInterval> | null = null

export async function setupWebMusicHandler(
    client: CustomClient,
): Promise<void> {
    try {
        await musicControlService.connect()

        await musicControlService.subscribeToCommands(
            async (cmd: MusicCommand) => {
                debugLog({
                    message: `Received web music command: ${cmd.type} for guild ${cmd.guildId}`,
                })
                const result = await handleCommand(client, cmd)
                await musicControlService.sendResult(result)
            },
        )

        client.player.on(
            'trackStart',
            async (rainlinkPlayer: { guildId: string }) => {
                const state = await buildQueueState(
                    client,
                    rainlinkPlayer.guildId,
                )
                await musicControlService.publishState(state)
            },
        )

        client.player.on(
            'trackEnd',
            async (rainlinkPlayer: { guildId: string }) => {
                setTimeout(() => {
                    void (async () => {
                        const state = await buildQueueState(
                            client,
                            rainlinkPlayer.guildId,
                        )
                        await musicControlService.publishState(state)
                    })().catch((error) => {
                        errorLog({
                            message:
                                'Error publishing queue state after trackEnd:',
                            error,
                        })
                    })
                }, 500)
            },
        )

        client.player.on(
            'queueAdd',
            async (rainlinkPlayer: { guildId: string }) => {
                const state = await buildQueueState(
                    client,
                    rainlinkPlayer.guildId,
                )
                await musicControlService.publishState(state)
            },
        )

        client.player.on(
            'queueEmpty',
            async (rainlinkPlayer: { guildId: string }) => {
                const state = await buildQueueState(
                    client,
                    rainlinkPlayer.guildId,
                )
                await musicControlService.publishState(state)
            },
        )

        client.player.on(
            'playerException',
            async (rainlinkPlayer: { guildId: string }) => {
                setTimeout(() => {
                    void (async () => {
                        const state = await buildQueueState(
                            client,
                            rainlinkPlayer.guildId,
                        )
                        await musicControlService.publishState(state)
                    })().catch(() => {})
                }, 500)
            },
        )

        // playerDestroy fires when the player is torn down (e.g. /stop from
        // Discord). The queue is gone by the time the handler runs, so
        // publish empty state directly.
        client.player.on(
            'playerDestroy',
            async (rainlinkPlayer: { guildId: string }) => {
                await musicControlService.publishState({
                    guildId: rainlinkPlayer.guildId,
                    currentTrack: null,
                    tracks: [],
                    isPlaying: false,
                    isPaused: false,
                    volume: 50,
                    repeatMode: 'off',
                    shuffled: false,
                    position: 0,
                    voiceChannelId: null,
                    voiceChannelName: null,
                    listeners: [],
                    timestamp: Date.now(),
                })
            },
        )

        // playerDestroy fires when the bot leaves the voice channel.
        client.player.on(
            'playerDestroy',
            async (rainlinkPlayer: { guildId: string }) => {
                setTimeout(() => {
                    void (async () => {
                        const state = await buildQueueState(
                            client,
                            rainlinkPlayer.guildId,
                        )
                        await musicControlService.publishState(state)
                    })().catch(() => {})
                }, 300)
            },
        )

        // Periodically publish state for all active queues to keep SSE clients in sync.
        // Clear any prior handle first — a second setup() call (e.g. reconnect) would
        // otherwise orphan the previous interval and double-publish forever.
        if (webMusicPublishInterval) {
            clearInterval(webMusicPublishInterval)
        }
        webMusicPublishInterval = setInterval(async () => {
            try {
                for (const rainlinkPlayer of client.player.players.values) {
                    if (!rainlinkPlayer) continue
                    const state = await buildQueueState(
                        client,
                        rainlinkPlayer.guildId,
                    )
                    // Only publish if queue is active (playing or has tracks)
                    if (state.isPlaying || state.tracks.length > 0) {
                        await musicControlService.publishState(state)
                    }
                }
            } catch (error) {
                debugLog({
                    message: 'Error during periodic state publish',
                    data: {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                })
            }
        }, 5000)

        infoLog({ message: 'Web music handler initialized' })
    } catch (error) {
        errorLog({ message: 'Failed to setup web music handler:', error })
    }
}

export function stopWebMusicHandler(): void {
    if (webMusicPublishInterval) {
        clearInterval(webMusicPublishInterval)
        webMusicPublishInterval = null
    }
}
