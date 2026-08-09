/**
 * Pure URL-normalization helpers for the `/play` query pipeline. No imports
 * on purpose — keep this dependency-free so any caller (slash command,
 * web dashboard command handler, tests) can use it without pulling in the
 * heavier Discord/Prisma import chain that queryUtils.ts carries.
 */

const BARE_DOMAIN_PREFIXES = [
    'youtube.com/',
    'www.youtube.com/',
    'm.youtube.com/',
    'music.youtube.com/',
    'youtu.be/',
    'soundcloud.com/',
    'www.soundcloud.com/',
    'on.soundcloud.com/',
    'open.spotify.com/',
    'spotify.com/',
]

function withScheme(url: string): string {
    if (/^https?:\/\//i.test(url)) return url
    const lower = url.toLowerCase()
    return BARE_DOMAIN_PREFIXES.some((prefix) => lower.startsWith(prefix))
        ? `https://${url}`
        : url
}

export function isUrl(query: string): boolean {
    return /^https?:\/\//i.test(withScheme(query))
}

// discord-player formats certain query types as "<prefix>:<value>" internally.
// Users sometimes paste these strings (e.g. from an error message) directly
// into /play — strip any such prefix so the raw value can be handled normally.
const KNOWN_QUERY_PREFIXES = /^(?:search:query|ytsearch\d*|scsearch):/i

export function cleanQueryInput(query: string): string {
    return KNOWN_QUERY_PREFIXES.test(query)
        ? query.replace(KNOWN_QUERY_PREFIXES, '')
        : query
}

/**
 * Strips Spotify tracking params (pi, nd, dlsi, si) that can cause the
 * Spotify extractor's validate() to reject the URL or its API call to fail.
 */
export function normalizeSpotifyUrl(url: string): string {
    if (!url.includes('spotify.com')) return url
    try {
        const parsed = new URL(withScheme(url))
        for (const param of ['pi', 'nd', 'dlsi', 'si']) {
            parsed.searchParams.delete(param)
        }
        return parsed.toString()
    } catch {
        return url
    }
}

/**
 * Strips SoundCloud playlist-context query params (`?in=...`) that the
 * SoundCloud extractor cannot resolve. The bare track URL resolves correctly.
 */
export function normalizeSoundCloudUrl(url: string): string {
    if (!url.includes('soundcloud.com')) return url
    try {
        const parsed = new URL(withScheme(url))
        parsed.searchParams.delete('in')
        return parsed.toString()
    } catch {
        return url
    }
}

/**
 * Strips YouTube "Start Radio" mix params (`list=RD...`, `start_radio=1`).
 * These auto-generated mixes are session-bound and the YouTube extractor's
 * validate() reclassifies any `list=` URL as a playlist query, then fails
 * with "No results found" because the mix has no resolvable content. Real
 * playlists (`list=PL...`/`OLAK5uy...`) are left untouched since those
 * resolve fine; the bare video URL always resolves correctly.
 */
export function normalizeYoutubeUrl(url: string): string {
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) return url
    try {
        const parsed = new URL(withScheme(url))
        const listId = parsed.searchParams.get('list')
        if (listId?.startsWith('RD')) {
            parsed.searchParams.delete('list')
            parsed.searchParams.delete('start_radio')
        }
        return parsed.toString()
    } catch {
        return url
    }
}

