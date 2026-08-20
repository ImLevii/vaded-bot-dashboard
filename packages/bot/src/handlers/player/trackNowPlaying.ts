import type { ColorResolvable } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { LRUCache } from 'lru-cache'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { EMBED_COLORS } from '../../utils/general/embeds'
import {
    createMusicControlButtons,
    createMusicActionButtons,
    createMusicFilterSelect,
} from '../../utils/music/buttonComponents'
import type {
    RainlinkQueueAdapter,
    RainlinkTrackAdapter,
} from '../../utils/music/rainlinkAdapter'
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

/** Animated music emoji ByteBlaze uses as the embed's author icon. */
const TRACK_ICON_URL =
    'https://cdn.discordapp.com/emojis/741605543046807626.gif'

/**
 * Now-playing embed, matching =VG=MUSIC-BOT (ByteBlaze)'s trackStart.ts
 * one-for-one: "Started Playing" author line with the animated music icon, a
 * bold linked title, and three inline fields whose labels are the same
 * backtick-wrapped-emoji strings from its en/event.player.yaml. No footer or
 * timestamp — ByteBlaze renders neither, and the reference layout is the
 * whole point of this embed.
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

    // Linked title, per ByteBlaze's getTitle(). A track with no uri (rare,
    // but rainlink types it nullable) falls back to plain text rather than
    // rendering a dead "[title]()" link.
    const title = track.url
        ? `[${track.title}](${track.url})`
        : (track.title ?? 'Unknown')

    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Started Playing', iconURL: TRACK_ICON_URL })
        .setDescription(`**${title}**`)
        .addFields([
            {
                name: '`✒️` | Author:',
                value: track.author || 'Unknown',
                inline: true,
            },
            {
                name: '`🕒` | Song Duration:',
                value: track.duration,
                inline: true,
            },
            {
                name: '`👤` | Requester:',
                value: requestedByDisplay,
                inline: true,
            },
        ])
        .setColor(EMBED_COLORS.MUSIC as ColorResolvable)
        .setThumbnail(
            track.thumbnail ??
                `https://img.youtube.com/vi/${track.identifier}/hqdefault.jpg`,
        )

    const components = [
        createMusicFilterSelect(),
        createMusicControlButtons(queue),
        createMusicActionButtons(queue),
    ]

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
                components,
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
        components,
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
