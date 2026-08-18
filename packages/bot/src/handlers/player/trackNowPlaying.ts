import type { Track, GuildQueue } from 'discord-player'
import { QueueRepeatMode } from 'discord-player'
import type { ColorResolvable } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { LRUCache } from 'lru-cache'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { EMBED_COLORS } from '../../utils/general/embeds'
import { getAutoplayCount } from '../../utils/music/autoplayManager'
import { constants } from '@lucky/shared/config'
import {
    createMusicControlButtons,
    createMusicActionButtons,
} from '../../utils/music/buttonComponents'
import type { QueueMetadata } from '../../types/QueueMetadata'
import { getPerSourceAcceptanceRateCached } from '../../utils/music/autoplay/autoplayAcceptanceCache'
import {
    isLastFmConfigured,
    getSessionKeyForUser,
    getTrackMetadata,
    updateNowPlaying as lastFmUpdateNowPlaying,
    scrobble as lastFmScrobble,
} from '../../lastfm'
import { getStreamBridgeFallbackLabel } from './streamBridge'

/**
 * Manages per-guild now-playing state with automatic TTL + explicit cleanup
 * on guild lifecycle events (guildDelete, channelDelete).
 */
class TrackNowPlayingState {
    private songInfoMessages = new LRUCache<
        string,
        { messageId: string; channelId: string; trackUrl?: string }
    >({
        max: 5000,
        ttl: 30 * 60 * 1000,
    })

    private lastFmTrackStartTime = new LRUCache<string, number>({
        max: 5000,
        ttl: 30 * 60 * 1000,
    })

    registerNowPlayingMessage(
        guildId: string,
        messageId: string,
        channelId: string,
        trackUrl?: string,
    ): void {
        this.songInfoMessages.set(guildId, { messageId, channelId, trackUrl })
    }

    getSongInfoMessage(
        guildId: string,
    ): { messageId: string; channelId: string; trackUrl?: string } | undefined {
        return this.songInfoMessages.get(guildId)
    }

    deleteSongInfoMessage(guildId: string): void {
        this.songInfoMessages.delete(guildId)
    }

    getLastFmTrackStartTime(guildId: string): number | undefined {
        return this.lastFmTrackStartTime.get(guildId)
    }

    setLastFmTrackStartTime(guildId: string, timestamp: number): void {
        this.lastFmTrackStartTime.set(guildId, timestamp)
    }

    deleteLastFmTrackStartTime(guildId: string): void {
        this.lastFmTrackStartTime.delete(guildId)
    }

    cleanupGuild(guildId: string): void {
        this.songInfoMessages.delete(guildId)
        this.lastFmTrackStartTime.delete(guildId)
        debugLog({
            message: 'Cleaned up now-playing state for guild',
            data: { guildId },
        })
    }
}

const trackNowPlayingState = new TrackNowPlayingState()

/**
 * Register an existing message as the "now playing" display for a guild.
 * Used by the /play command to pre-register its interaction reply so that
 * the playerStart handler edits it (with buttons) instead of sending a
 * duplicate "Now Playing" message.
 */
export function registerNowPlayingMessage(
    guildId: string,
    messageId: string,
    channelId: string,
    trackUrl?: string,
): void {
    trackNowPlayingState.registerNowPlayingMessage(
        guildId,
        messageId,
        channelId,
        trackUrl,
    )
}

export function getSongInfoMessage(
    guildId: string,
): { messageId: string; channelId: string; trackUrl?: string } | undefined {
    return trackNowPlayingState.getSongInfoMessage(guildId)
}

export function deleteSongInfoMessage(guildId: string): void {
    trackNowPlayingState.deleteSongInfoMessage(guildId)
}

export function cleanupGuildState(guildId: string): void {
    trackNowPlayingState.cleanupGuild(guildId)
}

function getLastFmRequesterId(
    queue: GuildQueue,
    track: Track,
): string | undefined {
    const metadataRequester = (
        track.metadata as { requestedById?: unknown } | undefined
    )?.requestedById
    const queueRequester = (queue.metadata as QueueMetadata | undefined)
        ?.requestedBy?.id
    const fallbackRequester =
        typeof metadataRequester === 'string' ? metadataRequester : undefined
    return track.requestedBy?.id ?? fallbackRequester ?? queueRequester
}

/**
 * Append the per-source acceptance rate to the recommendation reason.
 * Returns the original reason if the rate is unavailable or if reading fails.
 */
async function appendAcceptanceRate(
    reason: string,
    recommendationSource: string | undefined,
    guildId: string,
): Promise<string> {
    // Graceful omission if source is not available
    if (!recommendationSource) {
        return reason
    }

    try {
        const rows = await getPerSourceAcceptanceRateCached(guildId)
        const sourceRow = rows.find((r) => r.source === recommendationSource)

        if (!sourceRow || sourceRow.acceptanceRate === null) {
            return reason
        }

        const ratePercent = Math.round(sourceRow.acceptanceRate * 100)
        return `${reason} · ${ratePercent}% accepted`
    } catch {
        // On any error (cache issue, service issue), omit the rate gracefully
        return reason
    }
}

function buildProgressBar(posMs: number, durMs: number): string {
    const width = 18
    if (!durMs || durMs <= 0) return `${'▬'.repeat(width)}◉`
    const ratio = Math.min(posMs / durMs, 1)
    const filled = Math.round(ratio * width)
    return '▬'.repeat(filled) + '◉' + '─'.repeat(Math.max(0, width - filled))
}

function msToTimestamp(ms: number): string {
    const secs = Math.floor(ms / 1000)
    return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`
}

function repeatModeLabel(mode: QueueRepeatMode): string {
    switch (mode) {
        case QueueRepeatMode.TRACK:
            return 'Track'
        case QueueRepeatMode.QUEUE:
            return 'Queue'
        case QueueRepeatMode.AUTOPLAY:
            return 'Autoplay'
        default:
            return 'Off'
    }
}

export async function sendNowPlayingEmbed(
    queue: GuildQueue,
    track: Track,
    isAutoplay: boolean,
): Promise<void> {
    const metadata = queue.metadata as QueueMetadata | undefined
    if (!metadata?.channel) return

    const requester = track.requestedBy
    const requesterInfo = requester
        ? `Added by ${requester.username}`
        : 'Added automatically'
    const requestedByDisplay = requester
        ? `**${requester.username}**`
        : '🤖 Autoplay'
    const trackMetadata = (track.metadata ?? {}) as {
        recommendationReason?: string
        recommendationSource?: string
    }
    const autoplayCount = isAutoplay
        ? await getAutoplayCount(queue.guild.id)
        : null
    const baseFooter = isAutoplay
        ? `🤖 Autoplay • ${autoplayCount ?? 0}/${constants.MAX_AUTOPLAY_TRACKS ?? 50} tracks`
        : `🎧 ${requesterInfo}`
    let footer = baseFooter
    const fallbackLabel = getStreamBridgeFallbackLabel(track)
    if (fallbackLabel) footer = `${footer} • via fallback: ${fallbackLabel}`

    // Progress bar
    const posMs = queue.node.streamTime ?? 0
    const durMs = track.durationMS ?? 0
    const progressBar = buildProgressBar(posMs, durMs)
    const timestamp = `\`${msToTimestamp(posMs)} / ${msToTimestamp(durMs)}\``

    // Status line matching image: Volume | Mode | Shuffle
    const vol = `${queue.node.volume}%`
    const mode = repeatModeLabel(queue.repeatMode)
    // discord-player no longer exposes queue-level shuffle state.
    const shuffle = 'Off'

    const descLines = [
        `[**${track.title}**](${track.url})`,
        '',
        `**Artist:** ${track.author}`,
        `**Requested by:** ${requestedByDisplay}`,
        `**Volume:** ${vol} | **Mode:** ${mode} | **Shuffle:** ${shuffle}`,
        '',
        progressBar,
        timestamp,
    ]

    if (isAutoplay && trackMetadata.recommendationReason) {
        const reasonWithRate = await appendAcceptanceRate(
            trackMetadata.recommendationReason,
            trackMetadata.recommendationSource,
            queue.guild.id,
        )
        descLines.push('', `*${reasonWithRate}*`)
    }

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.MUSIC as ColorResolvable)
        .setTitle('<a:music:741605543046807626> Now Playing')
        .setDescription(descLines.join('\n'))
        .setThumbnail(track.thumbnail ?? null)
        .setFooter({ text: footer })
        .setTimestamp()

    const previousMessage = getSongInfoMessage(queue.guild.id)
    if (previousMessage && previousMessage.channelId === metadata.channel.id) {
        try {
            const message = await metadata.channel.messages.fetch(
                previousMessage.messageId,
            )
            await message.edit({
                content: null,
                embeds: [embed],
                files: [],
                components: [
                    createMusicControlButtons(queue),
                    createMusicActionButtons(queue),
                ],
            })
            // Refresh the cached trackUrl
            registerNowPlayingMessage(
                queue.guild.id,
                previousMessage.messageId,
                metadata.channel.id,
                track.url,
            )
            debugLog({
                message: 'Updated now playing message in channel',
                data: {
                    guildId: queue.guild.id,
                    trackTitle: track.title,
                    isAutoplay,
                },
            })
            return
        } catch (error) {
            debugLog({
                message: 'Failed to update existing now playing message',
                error,
                data: {
                    guildId: queue.guild.id,
                    messageId: previousMessage.messageId,
                },
            })
            deleteSongInfoMessage(queue.guild.id)
        }
    }

    const message = await metadata.channel.send({
        embeds: [embed],
        files: [],
        components: [
            createMusicControlButtons(queue),
            createMusicActionButtons(queue),
        ],
    })

    registerNowPlayingMessage(
        queue.guild.id,
        message.id,
        metadata.channel.id,
        track.url,
    )

    debugLog({
        message: 'Sent now playing message to channel',
        data: { guildId: queue.guild.id, trackTitle: track.title, isAutoplay },
    })
}

export async function updateLastFmNowPlaying(
    queue: GuildQueue,
    track: Track,
): Promise<void> {
    if (!isLastFmConfigured()) return
    const requesterId = getLastFmRequesterId(queue, track)
    const sessionKey = await getSessionKeyForUser(requesterId)
    if (!sessionKey) return
    const durationSec =
        track.durationMS > 0 ? Math.round(track.durationMS / 1000) : undefined
    const meta = await getTrackMetadata(track.author, track.title)
    if (!meta) {
        debugLog({
            message:
                'Last.fm metadata not found, updating now-playing without metadata',
            data: { artist: track.author, title: track.title },
        })
    }
    try {
        await lastFmUpdateNowPlaying(
            track.author,
            track.title,
            durationSec,
            sessionKey,
            meta ?? undefined,
        )
        trackNowPlayingState.setLastFmTrackStartTime(
            queue.guild.id,
            Math.floor(Date.now() / 1000),
        )
    } catch (err) {
        const is403 = err instanceof Error && err.message.includes('403')
        if (is403) {
            warnLog({
                message:
                    'Last.fm updateNowPlaying: session expired, re-auth needed',
                error: err,
            })
        } else {
            errorLog({ message: 'Last.fm updateNowPlaying failed', error: err })
        }
    }
}

export async function scrobbleCurrentTrackIfLastFm(
    queue: GuildQueue,
    track?: Track,
): Promise<void> {
    const trackToScrobble = track ?? queue.currentTrack
    if (!trackToScrobble || !isLastFmConfigured()) return
    const requesterId = getLastFmRequesterId(queue, trackToScrobble)
    const sessionKey = await getSessionKeyForUser(requesterId)
    if (!sessionKey) return
    const startedAt = trackNowPlayingState.getLastFmTrackStartTime(
        queue.guild.id,
    )
    trackNowPlayingState.deleteLastFmTrackStartTime(queue.guild.id)
    const timestamp = startedAt ?? Math.floor(Date.now() / 1000)
    const durationSec =
        trackToScrobble.durationMS > 0
            ? Math.round(trackToScrobble.durationMS / 1000)
            : undefined
    const meta = await getTrackMetadata(
        trackToScrobble.author,
        trackToScrobble.title,
    )
    if (!meta) {
        debugLog({
            message: 'Last.fm metadata not found, scrobbling without metadata',
            data: {
                artist: trackToScrobble.author,
                title: trackToScrobble.title,
            },
        })
    }
    try {
        await lastFmScrobble(
            trackToScrobble.author,
            trackToScrobble.title,
            timestamp,
            durationSec,
            sessionKey,
            meta ?? undefined,
        )
    } catch (err) {
        const is403 = err instanceof Error && err.message.includes('403')
        if (is403) {
            warnLog({
                message: 'Last.fm scrobble: session expired, re-auth needed',
                error: err,
            })
        } else {
            errorLog({ message: 'Last.fm scrobble failed', error: err })
        }
    }
}
