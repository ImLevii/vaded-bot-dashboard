import { RainlinkLoopMode } from 'rainlink'
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
import type {
    RainlinkQueueAdapter,
    RainlinkTrackAdapter,
} from '../../utils/music/rainlinkAdapter'
import { getPerSourceAcceptanceRateCached } from '../../utils/music/autoplay/autoplayAcceptanceCache'
import {
    isLastFmConfigured,
    getSessionKeyForUser,
    getTrackMetadata,
    updateNowPlaying as lastFmUpdateNowPlaying,
    scrobble as lastFmScrobble,
} from '../../lastfm'

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
 * the trackStart handler edits it (with buttons) instead of sending a
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
    queue: RainlinkQueueAdapter,
    track: RainlinkTrackAdapter,
): string | undefined {
    const metadataRequester = track.metadata.requestedById
    const queueRequester = queue.metadata.requestedBy?.id
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

function msToTimestamp(ms: number): string {
    const secs = Math.floor(ms / 1000)
    return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`
}

function repeatModeLabel(mode: RainlinkLoopMode): string {
    switch (mode) {
        case RainlinkLoopMode.SONG:
            return 'Track'
        case RainlinkLoopMode.QUEUE:
            return 'Queue'
        default:
            return 'Off'
    }
}

/**
 * Now-playing embed, styled after =VG=MUSIC-BOT (ByteBlaze)'s trackStart.ts:
 * author line + description + three inline fields (Author/Duration/
 * Requested by) + thumbnail + single accent color, on top of vaded's own
 * progress-bar/volume/mode line and Last.fm/autoplay-counter integration.
 */
export async function sendNowPlayingEmbed(
    queue: RainlinkQueueAdapter,
    track: RainlinkTrackAdapter,
    isAutoplay: boolean,
): Promise<void> {
    const metadata = queue.metadata
    if (!metadata?.channel) return

    const requester = track.requestedBy
    const requestedByDisplay = requester ? `${requester}` : '🤖 Autoplay'
    const trackMetadata = track.metadata as {
        recommendationReason?: string
        recommendationSource?: string
    }
    const autoplayCount = isAutoplay
        ? await getAutoplayCount(queue.guild.id)
        : null
    const footer = isAutoplay
        ? `🤖 Autoplay • ${autoplayCount ?? 0}/${constants.MAX_AUTOPLAY_TRACKS ?? 50} tracks`
        : requester
          ? `Added by ${requester.username}`
          : 'Added automatically'

    const posMs = queue.node.streamTime ?? 0
    const durMs = track.durationMS ?? 0
    const timestamp = `\`${msToTimestamp(posMs)} / ${msToTimestamp(durMs)}\``
    const vol = `${queue.node.volume}%`
    const mode = repeatModeLabel(queue.repeatMode)

    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Now Playing' })
        .setDescription(`**${track.title}**`)
        .addFields([
            { name: 'Author', value: track.author || 'Unknown', inline: true },
            { name: 'Duration', value: track.duration, inline: true },
            { name: 'Requested by', value: requestedByDisplay, inline: true },
        ])
        .setColor(EMBED_COLORS.MUSIC as ColorResolvable)
        .setThumbnail(track.thumbnail ?? null)
        .setFooter({
            text: `${footer} • Volume: ${vol} | Mode: ${mode} • ${timestamp}`,
        })
        .setTimestamp()

    if (isAutoplay && trackMetadata.recommendationReason) {
        const reasonWithRate = await appendAcceptanceRate(
            trackMetadata.recommendationReason,
            trackMetadata.recommendationSource,
            queue.guild.id,
        )
        embed.addFields([{ name: 'Why this track', value: reasonWithRate }])
    }

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
            registerNowPlayingMessage(
                queue.guild.id,
                previousMessage.messageId,
                metadata.channel.id,
                track.url ?? undefined,
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
        track.url ?? undefined,
    )

    debugLog({
        message: 'Sent now playing message to channel',
        data: { guildId: queue.guild.id, trackTitle: track.title, isAutoplay },
    })
}

export async function updateLastFmNowPlaying(
    queue: RainlinkQueueAdapter,
    track: RainlinkTrackAdapter,
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
    queue: RainlinkQueueAdapter,
    track?: RainlinkTrackAdapter,
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
