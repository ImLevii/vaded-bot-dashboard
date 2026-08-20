import { RainlinkLoopMode } from 'rainlink'
import type { GuildMember, VoiceBasedChannel } from 'discord.js'
import type {
    MusicTrackInfo as TrackInfo,
    QueueState,
    VoiceListener,
} from '@lucky/shared/services'
import type { CustomClient } from '../../types'
import { resolveGuildQueue } from '../../utils/music/queueResolver'

interface RawTrack {
    id: string
    title: string
    author: string
    url: string
    thumbnail?: string
    duration: { toString: () => string }
    durationMS: number
    requestedBy?: { username?: string } | null
    source?: string
    metadata?: {
        isAutoplay?: boolean
        recommendationReason?: string
    } | null
}

const KNOWN_SOURCES = ['youtube', 'spotify', 'soundcloud']

export function mapTrack(track: RawTrack): TrackInfo {
    const rawReason = track.metadata?.recommendationReason
    const reason = typeof rawReason === 'string' ? rawReason : undefined
    return {
        id: track.id,
        title: track.title,
        author: track.author,
        url: track.url,
        thumbnail: track.thumbnail,
        duration: track.durationMS,
        durationFormatted: track.duration.toString(),
        requestedBy: track.requestedBy?.username,
        source: (KNOWN_SOURCES.includes(track.source ?? '')
            ? track.source
            : 'unknown') as TrackInfo['source'],
        ...(reason ? { recommendationReason: reason } : {}),
    }
}

function mapListeners(
    channel: VoiceBasedChannel | null | undefined,
): VoiceListener[] {
    if (!channel) return []
    return [...channel.members.values()].map((m: GuildMember) => ({
        id: m.user.id,
        displayName: m.displayName,
        avatarUrl: m.user.displayAvatarURL({ size: 64 }) ?? null,
        isBot: m.user.bot,
    }))
}

export function repeatModeToString(
    mode: RainlinkLoopMode,
): 'off' | 'track' | 'queue' | 'autoplay' {
    switch (mode) {
        case RainlinkLoopMode.SONG:
            return 'track'
        case RainlinkLoopMode.QUEUE:
            return 'queue'
        default:
            return 'off'
    }
}

// 'autoplay' has no rainlink loop mode — deferred, see
// decisions/2026-06-10-defer-autoplay-engine-extraction.md; falls back to
// NONE like any other unrecognized value.
export function repeatModeToEnum(mode: string): RainlinkLoopMode {
    switch (mode) {
        case 'track':
            return RainlinkLoopMode.SONG
        case 'queue':
            return RainlinkLoopMode.QUEUE
        default:
            return RainlinkLoopMode.NONE
    }
}

export async function buildQueueState(
    client: CustomClient,
    guildId: string,
): Promise<QueueState> {
    const queue = resolveGuildQueue(client, guildId).queue

    if (!queue) {
        return emptyQueueState(guildId)
    }

    return {
        guildId,
        currentTrack: queue.currentTrack
            ? mapTrack(queue.currentTrack as unknown as RawTrack)
            : null,
        tracks: queue.tracks
            .toArray()
            .map((t: unknown) => mapTrack(t as RawTrack)),
        isPlaying: queue.node.isPlaying(),
        isPaused: queue.node.isPaused(),
        volume: queue.node.volume,
        repeatMode: repeatModeToString(queue.repeatMode),
        shuffled: false,
        position: queue.node.streamTime ?? 0,
        voiceChannelId: queue.channel?.id ?? null,
        voiceChannelName: queue.channel?.name ?? null,
        listeners: mapListeners(queue.channel),
        timestamp: Date.now(),
    }
}

function emptyQueueState(guildId: string): QueueState {
    return {
        guildId,
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
    }
}
