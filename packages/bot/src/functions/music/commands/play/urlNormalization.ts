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
 * Ensures a YouTube URL has a scheme before it reaches discord-player-youtubei's
 * validate()/handle(). "Start Radio" mix URLs (`list=RD...`) are intentionally
 * left intact: the installed extractor's getMixedPlaylist() resolves them into
 * their full track list (it needs both `list` and `v`), the same way a regular
 * `list=PL...` playlist expands.
 */
export function normalizeYoutubeUrl(url: string): string {
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) return url
    try {
        return new URL(withScheme(url)).toString()
    } catch {
        return url
    }
}
