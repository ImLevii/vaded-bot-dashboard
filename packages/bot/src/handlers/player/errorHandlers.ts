import type {
    Rainlink,
    RainlinkNode,
    RainlinkPlayer,
    RainlinkTrack,
} from 'rainlink'
import { errorLog, debugLog, infoLog, captureException } from '@lucky/shared/utils'
import { createErrorEmbed } from '../../utils/general/embeds'
import { wrapPlayer } from '../../utils/music/rainlinkAdapter'

/**
 * Lavalink resolves/streams tracks server-side, so the discord-player/yt-dlp-
 * bridge-specific recovery this file used to do (YouTube parser error
 * detection, "Bridge exhausted" alternative-track search-and-reinsert) has no
 * equivalent here — this is intentionally a much smaller handler: log, notify
 * the channel, skip to the next track.
 */

async function notifyChannelTrackFailed(
    queue: ReturnType<typeof wrapPlayer>,
    trackTitle: string,
    reason: string,
): Promise<void> {
    const channel = queue.metadata.channel
    if (!channel) return
    try {
        await channel.send({
            embeds: [
                createErrorEmbed(
                    '⚠️ Could not play track',
                    `**${trackTitle || 'this track'}** ${reason}. Skipping to next track.`,
                ),
            ],
        })
    } catch (error) {
        debugLog({
            message: 'Failed to notify channel about track failure',
            error,
            data: { guildId: queue.guild.id, trackTitle },
        })
    }
}

export const setupErrorHandlers = (player: Rainlink): void => {
    player.on(
        'playerException',
        (rainlinkPlayer: RainlinkPlayer, data: Record<string, unknown>) => {
            void (async () => {
                const queue = wrapPlayer(rainlinkPlayer)
                const track = queue.currentTrack
                errorLog({
                    message: `Player exception in guild ${queue.guild.id}:`,
                    data: { guildId: queue.guild.id, ...data },
                })
                captureException(
                    new Error(String(data?.exception ?? 'playerException')),
                    { context: 'player-exception', guildId: queue.guild.id },
                )
                await notifyChannelTrackFailed(
                    queue,
                    track?.title ?? '',
                    'could not be played',
                )
                await queue.node.skip()
            })().catch((error: unknown) => {
                errorLog({ message: 'playerException handler failed:', error })
            })
        },
    )

    player.on(
        'trackStuck',
        (rainlinkPlayer: RainlinkPlayer, data: Record<string, unknown>) => {
            void (async () => {
                const queue = wrapPlayer(rainlinkPlayer)
                const track = queue.currentTrack
                errorLog({
                    message: `Track stuck in guild ${queue.guild.id}:`,
                    data: { guildId: queue.guild.id, ...data },
                })
                await notifyChannelTrackFailed(
                    queue,
                    track?.title ?? '',
                    'got stuck while playing',
                )
                await queue.node.skip()
            })().catch((error: unknown) => {
                errorLog({ message: 'trackStuck handler failed:', error })
            })
        },
    )

    player.on(
        'trackResolveError',
        (
            rainlinkPlayer: RainlinkPlayer,
            track: RainlinkTrack,
            message: string,
        ) => {
            const queue = wrapPlayer(rainlinkPlayer)
            errorLog({
                message: `Track resolve error in guild ${queue.guild.id}:`,
                data: { guildId: queue.guild.id, track: track?.title, message },
            })
            void notifyChannelTrackFailed(
                queue,
                track?.title ?? '',
                'could not be resolved',
            ).catch((error: unknown) => {
                errorLog({ message: 'trackResolveError notify failed:', error })
            })
        },
    )

    // Log the success side too: with only the error/disconnect handlers below,
    // "is Lavalink actually connected?" was unanswerable from the logs —
    // a healthy node and a node that never finished connecting looked
    // identical (silence).
    player.on('nodeConnect', (node: RainlinkNode) => {
        infoLog({
            message: `Lavalink node connected (${node.options.name}) at ${node.options.host}:${node.options.port}`,
        })
    })

    player.on('nodeError', (node: RainlinkNode, error: Error) => {
        errorLog({
            message: `Lavalink node error (${node.options.name}):`,
            error,
        })
        captureException(error, {
            context: 'lavalink-node-error',
            node: node.options.name,
        })
    })

    player.on(
        'nodeDisconnect',
        (node: RainlinkNode, code: number, reason: Buffer | string) => {
            errorLog({
                message: `Lavalink node disconnected (${node.options.name}): code=${code} reason=${String(reason)}`,
            })
        },
    )
}
