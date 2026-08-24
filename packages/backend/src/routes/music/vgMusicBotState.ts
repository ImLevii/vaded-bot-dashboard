import type {
    QueueState,
    MusicTrackInfo as TrackInfo,
    VoiceListener,
    RepeatMode,
} from '@lucky/shared/services'
import { vgMusicBotRequest } from '../../services/vgMusicBotClient'

interface VgRequester {
    id: string
    username: string
    globalName: string | null
    defaultAvatarURL: string | null
}

interface VgTrack {
    id: string
    source: string
    title: string
    uri: string | null
    length: number
    durationFormatted: string
    thumbnail: string | null
    author: string
    requester: VgRequester | null
}

interface VgStatus {
    guildId: string
    loop: 'song' | 'queue' | 'none'
    pause: boolean
    volume: number
    autoplay: boolean
    position: number
    voiceChannelId: string | null
    voiceChannelName: string | null
    current: VgTrack | null
    queue: VgTrack[]
}

interface VgListener {
    id: string
    displayName: string
    avatarUrl: string | null
    isBot: boolean
}

function mapSource(source: string): TrackInfo['source'] {
    const lower = source.toLowerCase()
    if (lower.includes('youtube')) return 'youtube'
    if (lower.includes('spotify')) return 'spotify'
    if (lower.includes('soundcloud')) return 'soundcloud'
    return 'unknown'
}

function mapTrack(track: VgTrack): TrackInfo {
    return {
        id: track.id,
        title: track.title,
        author: track.author,
        url: track.uri ?? '',
        thumbnail: track.thumbnail ?? undefined,
        duration: track.length,
        durationFormatted: track.durationFormatted,
        requestedBy: track.requester?.id,
        source: mapSource(track.source),
    }
}

function mapRepeatMode(loop: VgStatus['loop'], autoplay: boolean): RepeatMode {
    if (autoplay) return 'autoplay'
    if (loop === 'song') return 'track'
    if (loop === 'queue') return 'queue'
    return 'off'
}

export function emptyQueueState(guildId: string): QueueState {
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

/** Fetches vg-music-bot's player status + voice listeners and maps them onto the wire contract the frontend already expects. Returns null if no player exists for this guild. */
export async function fetchQueueState(
    guildId: string,
): Promise<QueueState | null> {
    const statusRes = await vgMusicBotRequest<VgStatus>(
        `/v1/players/${encodeURIComponent(guildId)}`,
    )
    if (!statusRes.ok || !statusRes.body) return null
    const status = statusRes.body

    const listenersRes = await vgMusicBotRequest<{ data: VgListener[] }>(
        `/v1/players/${encodeURIComponent(guildId)}/listeners`,
    )
    const listeners: VoiceListener[] = (listenersRes.body?.data ?? []).map(
        (l) => ({
            id: l.id,
            displayName: l.displayName,
            avatarUrl: l.avatarUrl,
            isBot: l.isBot,
        }),
    )

    return {
        guildId,
        currentTrack: status.current ? mapTrack(status.current) : null,
        tracks: status.queue.map(mapTrack),
        isPlaying: !status.pause && status.current !== null,
        isPaused: status.pause,
        volume: status.volume,
        repeatMode: mapRepeatMode(status.loop, status.autoplay),
        shuffled: false,
        position: status.position,
        voiceChannelId: status.voiceChannelId,
        voiceChannelName: status.voiceChannelName,
        listeners,
        timestamp: Date.now(),
    }
}
