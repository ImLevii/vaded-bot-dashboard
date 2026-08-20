import type { RainlinkTrackAdapter as Track } from './rainlinkAdapter'

export type TrackSource = string

/**
 * Typed accessors for track fields whose underlying payload shape varies by
 * Lavalink source plugin (rainlink's `RainlinkTrack.raw.pluginInfo` is
 * `unknown`, mirroring discord-player's `Track.raw` being `any`).
 *
 * Narrowing those loosely-typed values here, at a single boundary, keeps
 * every call site type-safe instead of scattering casts — and gives one
 * place to adjust if the underlying source-plugin payloads change.
 */

/**
 * The track's playback source (youtube/spotify/soundcloud/…).
 */
export function trackSource(
    track: Pick<Track, 'source'>,
): TrackSource | undefined {
    const source: unknown = track.source
    return typeof source === 'string' ? source : undefined
}

/**
 * The album name from the Lavalink source plugin's raw payload, when present.
 *
 * `pluginInfo` is `unknown` and its shape varies by source plugin; read
 * `album.name` defensively and hand callers a plain `string | undefined`.
 *
 * Accepts `unknown` (rather than `Track`) because callers in the still-
 * discord-player-typed autoplay engine (deferred, see
 * decisions/2026-06-10-defer-autoplay-engine-extraction.md) pass a
 * differently-shaped track object; this stays a loose runtime probe for both.
 */
export function trackAlbumName(track: unknown): string | undefined {
    const raw = (track as { raw?: { raw?: unknown; album?: unknown } })?.raw
    const pluginInfo = (raw as { pluginInfo?: unknown } | undefined)
        ?.pluginInfo as { album?: { name?: string } } | undefined
    const legacyAlbum = (raw as { album?: { name?: string } } | undefined)
        ?.album
    const name = pluginInfo?.album?.name ?? legacyAlbum?.name
    return typeof name === 'string' ? name : undefined
}
