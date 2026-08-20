import type { SendableChannels, User, VoiceBasedChannel } from 'discord.js'
import { RainlinkSearchResultType, type Rainlink } from 'rainlink'
import { warnLog } from '@lucky/shared/utils'
import { addBreadcrumb } from '@lucky/shared/utils/monitoring'
import type {
    RainlinkQueueAdapter,
    RainlinkTrackAdapter,
} from '../../../../../utils/music/rainlinkAdapter'
import { wrapPlayer } from '../../../../../utils/music/rainlinkAdapter'
import { createGuildPlayer } from '../../../../../utils/music/createGuildPlayer'
import { resolveGuildQueue } from '../../../../../utils/music/queueResolver'

export type PlayResolutionArm =
    'primary' | 'youtube-fallback' | 'soundcloud-fallback' | 'failed'

interface ResolutionTelemetry {
    resolvedVia: PlayResolutionArm
    latencyMs: number
    requestedProvider: string
    errorClass?: string
}

export type PlaylistInfo = {
    title: string
    url: string
}

export type PlayResolutionResult = {
    track: RainlinkTrackAdapter
    queue: RainlinkQueueAdapter
    hadQueueBeforePlay: boolean
    searchResult: {
        playlist: PlaylistInfo | null
        tracks: RainlinkTrackAdapter[]
    }
}

type ResolveParams = {
    client: { player: Rainlink }
    guildId: string
    textId: string
    channel: SendableChannels | null
    voiceChannel: VoiceBasedChannel
    query: string
    requestedProvider: string
    requestedBy: User
    vcMemberIds: string[]
}

/**
 * Gets or creates the guild's rainlink player, searches (with an engine
 * fallback chain since Lavalink's own `defaultSearchEngine`/`searchFallback`
 * only covers the primary attempt), and enqueues the result.
 *
 * Unlike discord-player's `Player#play()`, rainlink has no single "resolve +
 * create queue + connect + enqueue" call — this reconstructs that flow.
 */
export async function resolveQueryWithFallbacks({
    client,
    guildId,
    textId,
    channel,
    voiceChannel,
    query,
    requestedProvider,
    requestedBy,
    vcMemberIds,
}: ResolveParams): Promise<{
    result: PlayResolutionResult
    telemetry: ResolutionTelemetry
}> {
    const startTime = Date.now()
    const telemetry: ResolutionTelemetry = {
        resolvedVia: 'primary',
        latencyMs: 0,
        requestedProvider,
    }

    const existing = resolveGuildQueue(client, guildId).queue
    const hadQueueBeforePlay = Boolean(existing)
    const queue =
        existing ??
        wrapPlayer(
            await createGuildPlayer({
                rainlink: client.player,
                guild: voiceChannel.guild,
                voiceChannel,
                textId,
            }),
        )
    if (!existing) {
        queue.setMetadata({ channel, requestedBy, vcMemberIds })
    }

    const attempts: { engine: string | undefined; arm: PlayResolutionArm }[] = [
        { engine: undefined, arm: 'primary' },
        { engine: 'youtube', arm: 'youtube-fallback' },
        { engine: 'soundcloud', arm: 'soundcloud-fallback' },
    ]

    let lastError: unknown
    for (const attempt of attempts) {
        try {
            const searchResult = await queue.search(query, {
                requestedBy,
                engine: attempt.engine,
            })
            if (searchResult.tracks.length === 0) {
                lastError = new Error('No results found')
                continue
            }

            telemetry.latencyMs = Date.now() - startTime
            telemetry.resolvedVia = attempt.arm

            const isPlaylist =
                searchResult.type === RainlinkSearchResultType.PLAYLIST
            for (const track of searchResult.tracks) {
                queue.addTrack(track)
            }
            if (!queue.node.isPlaying() && !queue.node.isPaused()) {
                await queue.node.play()
            }

            return {
                result: {
                    track: searchResult.tracks[0],
                    queue,
                    hadQueueBeforePlay,
                    searchResult: {
                        playlist: isPlaylist
                            ? {
                                  title: searchResult.playlistName ?? query,
                                  url: query,
                              }
                            : null,
                        tracks: searchResult.tracks,
                    },
                },
                telemetry,
            }
        } catch (error) {
            lastError = error
            if (attempt.arm === 'primary') {
                warnLog({
                    message: 'Primary search failed, falling back to YouTube',
                    data: {
                        query,
                        requestedProvider,
                        error: String(error),
                    },
                })
            }
        }
    }

    telemetry.latencyMs = Date.now() - startTime
    telemetry.resolvedVia = 'failed'
    telemetry.errorClass =
        lastError instanceof Error ? lastError.constructor.name : 'Error'
    // A newly-created, still-empty queue shouldn't be left connected to voice.
    if (!hadQueueBeforePlay) await queue.delete()
    throw lastError instanceof Error ? lastError : new Error('No results found')
}

/**
 * Emit telemetry breadcrumb for play resolution.
 * Non-throwing to prevent telemetry from breaking the play flow.
 */
export function emitPlayResolutionTelemetry(
    telemetry: ResolutionTelemetry,
): void {
    try {
        addBreadcrumb(
            `play_provider_resolution: ${telemetry.resolvedVia}`,
            'play',
            'info',
            {
                requestedProvider: telemetry.requestedProvider,
                resolvedVia: telemetry.resolvedVia,
                latencyMs: telemetry.latencyMs,
                ...(telemetry.errorClass
                    ? { errorClass: telemetry.errorClass }
                    : {}),
            },
        )
    } catch {
        // Telemetry must never break the play flow
    }
}

export { RainlinkSearchResultType }
