/** Repeat mode for playback. */
export type RepeatMode = 'off' | 'track' | 'queue' | 'autoplay'

/** Information about a playable track. */
export interface TrackInfo {
    id: string
    title: string
    author: string
    url: string
    thumbnail?: string
    duration: number
    durationFormatted: string
    requestedBy?: string
    source: 'youtube' | 'spotify' | 'soundcloud' | 'unknown'
    recommendationReason?: string
    recommendationFeedback?: 'like' | 'dislike'
    sessionSnapshotId?: string
}

/** Health state of a music provider. */
export interface ProviderHealthState {
    provider: string
    score: number
    consecutiveFailures: number
    cooldownUntil: number | null
}

/** A member currently connected to the bot's voice channel. */
export interface VoiceListener {
    id: string
    displayName: string
    avatarUrl: string | null
    isBot: boolean
}

/** Current state of the music queue. */
export interface QueueState {
    guildId: string
    currentTrack: TrackInfo | null
    tracks: TrackInfo[]
    isPlaying: boolean
    isPaused: boolean
    volume: number
    repeatMode: RepeatMode
    shuffled: boolean
    position: number
    voiceChannelId: string | null
    voiceChannelName: string | null
    /** Non-bot members currently connected to the voice channel. */
    listeners: VoiceListener[]
    providerHealth?: ProviderHealthState[]
    lastRecoveryAction?: string
    sessionSnapshotId?: string
    timestamp: number
}

export interface MusicCommandResult {
    id: string
    guildId: string
    success: boolean
    error?: string
    data?: Record<string, unknown>
    timestamp: number
}

export interface ImportPlaylistResult {
    success: boolean
    tracksAdded: number
    playlistName?: string
    source: string
    error?: string
}
