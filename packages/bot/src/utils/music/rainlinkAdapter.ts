import type {
    Client,
    SendableChannels,
    User,
    VoiceBasedChannel,
} from 'discord.js'
import {
    RainlinkLoopMode,
    RainlinkSearchResultType,
    VoiceConnectState,
    type RainlinkPlayer,
    type RainlinkTrack,
} from 'rainlink'

/**
 * Everything below exposes the same field/method names the rest of the bot
 * already reads off discord-player's `Track`/`GuildQueue` (title/url/author/
 * durationMS/thumbnail/requestedBy/metadata, queue.node.*, queue.tracks,
 * queue.history, queue.repeatMode/setRepeatMode, queue.metadata, ...).
 * This keeps command/embed/handler call sites unchanged while the object on
 * the other end is now backed by a RainlinkPlayer instead of discord-player's
 * GuildQueue. See decisions/ — this is the seam described in the Lavalink
 * migration plan as "adapter, not a mechanical rewrite."
 */

const trackMetadataStore = new WeakMap<RainlinkTrack, Record<string, unknown>>()

export function getTrackMetadata(
    track: RainlinkTrack,
): Record<string, unknown> {
    return trackMetadataStore.get(track) ?? {}
}

export function setTrackMetadata(
    track: RainlinkTrack,
    metadata: Record<string, unknown>,
): void {
    trackMetadataStore.set(track, { ...getTrackMetadata(track), ...metadata })
}

function formatDuration(ms: number): string {
    if (!ms || ms <= 0) return '0:00'
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const paddedSeconds = seconds.toString().padStart(2, '0')
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`
    }
    return `${minutes}:${paddedSeconds}`
}

export class RainlinkTrackAdapter {
    constructor(readonly raw: RainlinkTrack) {}

    get title(): string {
        return this.raw.title
    }

    get url(): string | null {
        return this.raw.uri
    }

    get author(): string {
        return this.raw.author
    }

    get durationMS(): number {
        return this.raw.duration
    }

    get duration(): string {
        return formatDuration(this.raw.duration)
    }

    get thumbnail(): string | null {
        return this.raw.artworkUrl
    }

    get identifier(): string {
        return this.raw.identifier
    }

    /** Alias for `identifier` — discord-player's `Track.id` equivalent. */
    get id(): string {
        return this.raw.identifier
    }

    /** Playback source (youtube/spotify/soundcloud/…), from Lavalink's sourceName. */
    get source(): string {
        return this.raw.source
    }

    get requestedBy(): User | undefined {
        return this.raw.requester as User | undefined
    }

    get metadata(): Record<string, unknown> {
        return getTrackMetadata(this.raw)
    }

    setMetadata(metadata: Record<string, unknown>): void {
        setTrackMetadata(this.raw, metadata)
    }
}

const trackAdapterCache = new WeakMap<RainlinkTrack, RainlinkTrackAdapter>()

export function wrapTrack(track: RainlinkTrack): RainlinkTrackAdapter {
    let adapter = trackAdapterCache.get(track)
    if (!adapter) {
        adapter = new RainlinkTrackAdapter(track)
        trackAdapterCache.set(track, adapter)
    }
    return adapter
}

export interface AdapterQueueMetadata {
    channel?: SendableChannels | null
    requestedBy?: User | null
    vcMemberIds?: string[]
    skipConnectionEventRestore?: boolean
    /** Discord client, stashed so the adapter can resolve `queue.channel`
     *  (the voice channel) from rainlink's `voiceId` string on demand. */
    client?: Client | null
}

const queueMetadataStore = new WeakMap<RainlinkPlayer, AdapterQueueMetadata>()

class RainlinkNodeAdapter {
    constructor(private readonly player: RainlinkPlayer) {}

    isPaused(): boolean {
        return this.player.paused
    }

    isPlaying(): boolean {
        return this.player.playing
    }

    get streamTime(): number {
        return this.player.position
    }

    get volume(): number {
        return this.player.volume
    }

    async play(track?: RainlinkTrackAdapter): Promise<void> {
        await this.player.play(track?.raw)
    }

    async pause(): Promise<void> {
        await this.player.pause()
    }

    async resume(): Promise<void> {
        await this.player.resume()
    }

    async skip(): Promise<void> {
        await this.player.skip()
    }

    /** Stops playback without destroying the player/leaving voice. */
    async stop(): Promise<void> {
        await this.player.stop(false)
    }

    async seek(ms: number): Promise<void> {
        await this.player.seek(ms)
    }

    async setVolume(volume: number): Promise<void> {
        await this.player.setVolume(volume)
    }
}

class RainlinkTracksAdapter {
    constructor(private readonly player: RainlinkPlayer) {}

    get size(): number {
        return this.player.queue.size
    }

    get totalSize(): number {
        return this.player.queue.totalSize
    }

    toArray(): RainlinkTrackAdapter[] {
        return this.player.queue.map((track) => wrapTrack(track))
    }

    at(index: number): RainlinkTrackAdapter | undefined {
        const track = this.player.queue.at(index)
        return track ? wrapTrack(track) : undefined
    }

    clear(): void {
        this.player.queue.clear()
    }

    shuffle(): void {
        this.player.queue.shuffle()
    }

    remove(position: number): void {
        this.player.queue.remove(position)
    }

    [Symbol.iterator](): Iterator<RainlinkTrackAdapter> {
        return this.toArray()[Symbol.iterator]()
    }
}

class RainlinkHistoryAdapter {
    constructor(private readonly player: RainlinkPlayer) {}

    get previousTrack(): RainlinkTrackAdapter | undefined {
        const previous = this.player.getPrevious()
        const last = previous[previous.length - 1]
        return last ? wrapTrack(last) : undefined
    }

    get tracks(): { data: RainlinkTrackAdapter[] } {
        return {
            data: this.player.getPrevious().map((track) => wrapTrack(track)),
        }
    }

    /** Replays the most recent previous track. */
    async back(): Promise<void> {
        await this.player.previous()
    }
}

export class RainlinkQueueAdapter {
    readonly node: RainlinkNodeAdapter
    readonly tracks: RainlinkTracksAdapter
    readonly history: RainlinkHistoryAdapter

    constructor(readonly player: RainlinkPlayer) {
        this.node = new RainlinkNodeAdapter(player)
        this.tracks = new RainlinkTracksAdapter(player)
        this.history = new RainlinkHistoryAdapter(player)
    }

    get guild(): { id: string } {
        return { id: this.player.guildId }
    }

    get voiceId(): string | null {
        return this.player.voiceId
    }

    get textId(): string {
        return this.player.textId
    }

    /** The voice channel the player is connected to, resolved via the
     *  Discord client stashed in metadata (see AdapterQueueMetadata.client). */
    get channel(): VoiceBasedChannel | null {
        const client = this.metadata.client
        if (!client || !this.player.voiceId) return null
        const channel = client.channels.cache.get(this.player.voiceId)
        return (
            channel?.isVoiceBased?.() ? channel : null
        ) as VoiceBasedChannel | null
    }

    /** Whether the underlying voice connection is currently connected. */
    get isVoiceConnected(): boolean {
        return this.player.voice.state === VoiceConnectState.CONNECTED
    }

    /** Re-establishes the voice connection (best-effort "rejoin"). */
    async rejoinVoice(): Promise<void> {
        await this.player.voice.connect()
    }

    get currentTrack(): RainlinkTrackAdapter | undefined {
        const current = this.player.queue.current
        return current ? wrapTrack(current) : undefined
    }

    /** Top-level alias for `node.isPlaying()` — discord-player's `GuildQueue`
     *  exposed this at both levels; some call sites use the shorter form. */
    isPlaying(): boolean {
        return this.node.isPlaying()
    }

    get repeatMode(): RainlinkLoopMode {
        return this.player.loop
    }

    setRepeatMode(mode: RainlinkLoopMode): void {
        this.player.setLoop(mode)
    }

    get metadata(): AdapterQueueMetadata {
        return queueMetadataStore.get(this.player) ?? {}
    }

    setMetadata(metadata: AdapterQueueMetadata): void {
        queueMetadataStore.set(this.player, { ...this.metadata, ...metadata })
    }

    /**
     * rainlink connects at player-creation time (voiceId is required up
     * front by `rainlink.create()`), so there's no separate connect step —
     * kept as a no-op so call sites written against discord-player's
     * `queue.connect()` don't need to branch on engine.
     */
    async connect(): Promise<void> {}

    async delete(): Promise<void> {
        await this.player.destroy()
    }

    clear(): void {
        this.player.queue.clear()
    }

    async search(
        query: string,
        options?: { requestedBy?: User; engine?: string },
    ): Promise<{
        tracks: RainlinkTrackAdapter[]
        type: RainlinkSearchResultType
        playlistName?: string
    }> {
        const result = await this.player.search(query, {
            requester: options?.requestedBy,
            engine: options?.engine,
        })
        return {
            tracks: result.tracks.map((track) => wrapTrack(track)),
            type: result.type,
            playlistName: result.playlistName,
        }
    }

    addTrack(track: RainlinkTrackAdapter): void {
        this.player.queue.add(track.raw)
    }

    removeTrack(track: RainlinkTrackAdapter): void {
        const index = this.player.queue.findIndex((t) => t === track.raw)
        if (index >= 0) this.player.queue.remove(index)
    }

    /** RainlinkQueue extends Array, so a plain splice works for insertion. */
    insertTrack(track: RainlinkTrackAdapter, position: number): void {
        this.player.queue.splice(position, 0, track.raw)
    }
}

const queueAdapterCache = new WeakMap<RainlinkPlayer, RainlinkQueueAdapter>()

export function wrapPlayer(player: RainlinkPlayer): RainlinkQueueAdapter {
    let adapter = queueAdapterCache.get(player)
    if (!adapter) {
        adapter = new RainlinkQueueAdapter(player)
        queueAdapterCache.set(player, adapter)
    }
    return adapter
}

export { RainlinkLoopMode, RainlinkSearchResultType }
