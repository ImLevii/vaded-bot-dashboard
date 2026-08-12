import { spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { PassThrough } from 'stream'
import type { Readable } from 'stream'
import type { Track } from 'discord-player'
import { infoLog, warnLog, debugLog } from '@lucky/shared/utils'
import { assertDefined } from '@lucky/shared/utils/guards'
import {
    cleanTitle,
    cleanAuthor,
    cleanSearchQuery,
} from '../../utils/music/searchQueryCleaner'
import { providerHealthService } from '../../utils/music/search/providerHealth'
import { streamViaSoundCloud } from './soundcloudMatcher'
import {
    addBreadcrumb,
    captureMessage,
    safeUrlOrigin,
    scrubUrls,
} from '../../utils/monitoring/sentry'

const ALLOWED_YTDLP_DOMAINS = new Set([
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'music.youtube.com',
    'soundcloud.com',
    'www.soundcloud.com',
])

export function resolveYtDlpExecutable(): string {
    const configuredPath = process.env.YT_DLP_PATH?.trim()
    if (configuredPath) return configuredPath

    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        const wingetPackages = join(
            process.env.LOCALAPPDATA,
            'Microsoft',
            'WinGet',
            'Packages',
        )
        if (existsSync(wingetPackages)) {
            const packageDirectory = readdirSync(wingetPackages).find((entry) =>
                entry.startsWith('yt-dlp.yt-dlp_'),
            )
            if (packageDirectory) {
                const executable = join(
                    wingetPackages,
                    packageDirectory,
                    'yt-dlp.exe',
                )
                if (existsSync(executable)) return executable
            }
        }
    }

    return 'yt-dlp'
}

/**
 * Path to a Netscape-format cookies.txt (exported from a real, logged-in
 * YouTube session) for hosts where YouTube's bot-check blocks anonymous
 * requests from the IP (common on datacenter/hosting-provider IPs, e.g. most
 * Pterodactyl panels). Returns null when unset or the file doesn't exist.
 */
function resolveYtDlpCookiesPath(): string | null {
    const configured = process.env.YT_DLP_COOKIES_PATH?.trim()
    if (!configured) return null
    return existsSync(configured) ? configured : null
}

/** Returns the directory containing ffmpeg.exe for --ffmpeg-location, or null. */
function resolveWingetFfmpegBin(): string | null {
    const configured = process.env.YT_DLP_FFMPEG_PATH?.trim()
    if (configured) return configured

    if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return null
    const wingetPackages = join(
        process.env.LOCALAPPDATA,
        'Microsoft',
        'WinGet',
        'Packages',
    )
    if (!existsSync(wingetPackages)) return null
    const pkgDir = readdirSync(wingetPackages).find((d) =>
        d.startsWith('yt-dlp.FFmpeg_'),
    )
    if (!pkgDir) return null
    // layout: <pkg>/<build-name>/bin/ffmpeg.exe
    const buildDir = readdirSync(join(wingetPackages, pkgDir)).find((d) =>
        d.startsWith('ffmpeg-'),
    )
    if (!buildDir) return null
    const bin = join(wingetPackages, pkgDir, buildDir, 'bin')
    return existsSync(join(bin, 'ffmpeg.exe')) ? bin : null
}

/**
 * YouTube's oembed endpoint is a lightweight, unauthenticated metadata
 * lookup (the same one Discord itself uses for link embeds) — it isn't
 * covered by the bot-check that blocks yt-dlp's streaming pipeline. Used as
 * a last resort to recover a title when the extractor handed us an empty
 * one, so the SoundCloud fallback below still has something to search for.
 */
async function fetchYoutubeOembedTitle(
    url: string,
): Promise<{ title: string; author: string } | null> {
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5_000)
        try {
            const response = await fetch(oembedUrl, {
                signal: controller.signal,
            })
            if (!response.ok) return null
            const data = (await response.json()) as {
                title?: string
                author_name?: string
            }
            if (!data.title) return null
            return { title: data.title, author: data.author_name ?? '' }
        } finally {
            clearTimeout(timeout)
        }
    } catch {
        return null
    }
}

function validateYtDlpUrl(url: string): void {
    if (url.startsWith('ytsearch')) return
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch (error) {
        throw new Error(`yt-dlp: invalid URL`, { cause: error })
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(`yt-dlp: only https URLs are allowed`)
    }
    if (!ALLOWED_YTDLP_DOMAINS.has(parsed.hostname.toLowerCase())) {
        throw new Error(`yt-dlp: domain not in allowlist: ${parsed.hostname}`)
    }
}

const LIVE_STREAM_ERROR_FRAGMENT = 'live stream recording is not available'
// yt-dlp's message for this varies in punctuation ("you're"/"you’re"); match the stable prefix.
const BOT_CHECK_ERROR_FRAGMENT = 'sign in to confirm'

/**
 * YouTube's `android`/`ios` player clients do not accept cookie
 * authentication — yt-dlp skips the cookie jar for them and the request goes
 * out anonymous. Forcing `player_client=android` (the long-standing default)
 * therefore made a configured YT_DLP_COOKIES_PATH silently useless: the very
 * bot-check the cookies exist to defeat still fired. Use a cookie-capable
 * client whenever cookies are available, and keep `android` otherwise since
 * it needs no auth at all.
 */
const COOKIE_CAPABLE_CLIENT = 'web'
const ANONYMOUS_CLIENT = 'android'

function defaultPlayerClient(): string {
    return resolveYtDlpCookiesPath() ? COOKIE_CAPABLE_CLIENT : ANONYMOUS_CLIENT
}

/** Retry clients for the bot-check path, filtered to ones cookies work with. */
function botCheckRetryClients(hasCookies: boolean): readonly string[] {
    return hasCookies ? (['tv', 'mweb'] as const) : (['tv', 'ios'] as const)
}

/** `playerClient` defaults per `defaultPlayerClient()`; pass 'web' for live streams. */
export function streamViaYtDlp(
    url: string,
    playerClient: string = defaultPlayerClient(),
): Promise<Readable> {
    try {
        validateYtDlpUrl(url)
    } catch (err) {
        return Promise.reject(err)
    }
    return new Promise<Readable>((resolve, reject) => {
        const ffmpegBin = resolveWingetFfmpegBin()
        const cookiesPath = resolveYtDlpCookiesPath()
        const proc = spawn(
            resolveYtDlpExecutable(),
            [
                '--no-playlist',
                '-f',
                'bestaudio/best',
                '-o',
                '-',
                '--quiet',
                '--no-warnings',
                '--no-progress',
                '--extractor-args',
                `youtube:player_client=${playerClient}`,
                '--js-runtimes',
                `node:${process.execPath}`,
                // explicit ffmpeg path so HLS/m3u8 streams can be muxed
                ...(ffmpegBin ? ['--ffmpeg-location', ffmpegBin] : []),
                // authenticated cookies work around YouTube's bot-check on
                // datacenter/hosting IPs ("Sign in to confirm you're not a bot")
                ...(cookiesPath ? ['--cookies', cookiesPath] : []),
                url,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        )

        const timeout = setTimeout(() => {
            proc.kill()
            reject(new Error('yt-dlp: timed out waiting for stream start'))
        }, 15_000)

        const stderrChunks: Buffer[] = []
        assertDefined(proc.stderr, 'stderr guaranteed by stdio config').on(
            'data',
            (chunk: Buffer) => stderrChunks.push(chunk),
        )

        let settled = false

        assertDefined(proc.stdout, 'stdout guaranteed by stdio config').once(
            'data',
            (firstChunk: Buffer) => {
                if (settled) return
                settled = true
                clearTimeout(timeout)
                const through = new PassThrough()
                through.write(firstChunk)
                assertDefined(
                    proc.stdout,
                    'stdout guaranteed by stdio config',
                ).pipe(through)
                resolve(through)
            },
        )

        proc.once('error', (err) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            proc.kill()
            reject(err)
        })

        proc.once('close', (code) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            if (code && code !== 0) {
                const stderr = Buffer.concat(stderrChunks).toString().trim()
                const reason = stderr ? ` — ${stderr.split('\n')[0]}` : ''
                reject(new Error(`yt-dlp exited with code ${code}${reason}`))
            }
        })
    })
}

export function streamViaYtDlpSearch(query: string): Promise<Readable> {
    if (!query.trim())
        return Promise.reject(new Error('yt-dlp search: empty query'))
    return streamViaYtDlp(`ytsearch1:${query}`)
}

/**
 * SoundCloud fallback stages that can resolve a track when the primary
 * yt-dlp paths fail. When one of these resolves, the stage is stamped onto
 * the track's metadata so the Now Playing embed can tell the user a fallback
 * happened. Primary yt-dlp resolutions leave the metadata untouched.
 */
export type StreamBridgeFallbackStage =
    | 'soundcloud-full'
    | 'soundcloud-title'
    | 'soundcloud-core'

export const STREAM_BRIDGE_FALLBACK_METADATA_KEY = 'streamBridgeFallbackStage'

const FALLBACK_STAGE_LABELS: Record<StreamBridgeFallbackStage, string> = {
    'soundcloud-full': 'SoundCloud search',
    'soundcloud-title': 'SoundCloud title-only search',
    'soundcloud-core': 'SoundCloud simplified-title search',
}

/**
 * Human-readable label of the fallback stage that resolved this track, or
 * undefined when the primary yt-dlp source resolved it (or no stream was
 * bridged at all). Used to render a subtle footnote in the Now Playing embed.
 */
export function getStreamBridgeFallbackLabel(track: {
    metadata?: unknown
}): string | undefined {
    const stage = (track.metadata as Record<string, unknown> | undefined)?.[
        STREAM_BRIDGE_FALLBACK_METADATA_KEY
    ]
    if (typeof stage !== 'string') return undefined
    return FALLBACK_STAGE_LABELS[stage as StreamBridgeFallbackStage]
}

function stampFallbackStage(
    track: Pick<Track, 'title' | 'author' | 'duration' | 'url'>,
    stage: StreamBridgeFallbackStage,
): void {
    const mutable = track as { metadata?: unknown }
    const existing =
        typeof mutable.metadata === 'object' && mutable.metadata !== null
            ? (mutable.metadata as Record<string, unknown>)
            : {}
    mutable.metadata = {
        ...existing,
        [STREAM_BRIDGE_FALLBACK_METADATA_KEY]: stage,
    }
}

export async function createResilientStream(
    track: Pick<Track, 'title' | 'author' | 'duration' | 'url'>,
    _ext?: unknown,
): Promise<Readable> {
    let cleanedTitle = cleanTitle(track.title)
    let cleanedAuthor = cleanAuthor(track.author)
    const isSpotifyUrl = track.url?.includes('open.spotify.com') ?? false

    debugLog({
        message: 'Bridge: resolving stream',
        data: {
            title: track.title,
            author: track.author,
            cleanedTitle,
            cleanedAuthor,
            hasUrl: Boolean(track.url),
            isSpotifyUrl,
        },
    })

    let youtubeStage: string | undefined

    if (track.url && !isSpotifyUrl) {
        try {
            const stream = await streamViaYtDlp(track.url)
            addBreadcrumb(
                'YouTube stream resolved via yt-dlp',
                'music.youtube-extraction',
                'info',
            )
            infoLog({
                message: 'Bridge: streamed via yt-dlp',
                data: { url: track.url, title: cleanedTitle || track.title },
            })
            return stream
        } catch (ytdlpError) {
            const errMsg = (ytdlpError as Error).message
            const lowerErrMsg = errMsg.toLowerCase()
            // android client cannot stream live content; retry with web client
            if (lowerErrMsg.includes(LIVE_STREAM_ERROR_FRAGMENT)) {
                try {
                    const liveStream = await streamViaYtDlp(track.url, 'web')
                    infoLog({
                        message: 'Bridge: live stream resolved via web client',
                        data: {
                            url: track.url,
                            title: cleanedTitle || track.title,
                        },
                    })
                    return liveStream
                } catch {
                    // fall through to SoundCloud stages below
                }
            }
            // YouTube's bot-check ("Sign in to confirm you're not a bot") is
            // usually IP-based, but each client is validated differently from
            // android and sometimes still gets through without cookies.
            if (lowerErrMsg.includes(BOT_CHECK_ERROR_FRAGMENT)) {
                const hasCookies = Boolean(resolveYtDlpCookiesPath())
                for (const retryClient of botCheckRetryClients(hasCookies)) {
                    try {
                        const retryStream = await streamViaYtDlp(
                            track.url,
                            retryClient,
                        )
                        infoLog({
                            message: `Bridge: bot-check bypassed via ${retryClient} client`,
                            data: {
                                url: track.url,
                                title: cleanedTitle || track.title,
                            },
                        })
                        return retryStream
                    } catch {
                        // try the next client, then fall through to SoundCloud stages below
                    }
                }
            }
            youtubeStage = 'yt-dlp-url'
            addBreadcrumb(
                'YouTube extraction failed via yt-dlp URL',
                'music.youtube-extraction',
                'warning',
                {
                    error: scrubUrls(errMsg),
                    url: safeUrlOrigin(track.url),
                },
            )
            captureMessage(
                `YouTube extraction failed: ${scrubUrls(errMsg)}`,
                'warning',
                {
                    url: safeUrlOrigin(track.url),
                },
                {
                    category: 'music.youtube-extraction',
                    stage: 'yt-dlp-url',
                },
            )
            warnLog({
                message: 'Bridge: yt-dlp failed, falling back to SoundCloud',
                data: {
                    error: errMsg,
                    url: track.url,
                    cleanedTitle,
                },
            })
        }
    }

    if (isSpotifyUrl) {
        const ytQuery = `${cleanSearchQuery(cleanedTitle, cleanedAuthor)} official audio`
        try {
            const stream = await streamViaYtDlpSearch(ytQuery)
            addBreadcrumb(
                'YouTube search stream resolved for Spotify source',
                'music.youtube-extraction',
                'info',
            )
            infoLog({
                message:
                    'Bridge: streamed via yt-dlp YouTube search (Spotify source)',
                data: { query: ytQuery, title: cleanedTitle },
            })
            return stream
        } catch (ytSearchError) {
            youtubeStage = 'yt-dlp-search'
            addBreadcrumb(
                'YouTube extraction failed via search',
                'music.youtube-extraction',
                'warning',
                {
                    error: scrubUrls((ytSearchError as Error).message),
                    searchText: ytQuery,
                },
            )
            captureMessage(
                `YouTube search extraction failed: ${scrubUrls((ytSearchError as Error).message)}`,
                'warning',
                {
                    searchText: ytQuery,
                },
                {
                    category: 'music.youtube-extraction',
                    stage: 'yt-dlp-search',
                },
            )
            warnLog({
                message:
                    'Bridge: yt-dlp YouTube search failed, falling back to SoundCloud',
                data: {
                    error: (ytSearchError as Error).message,
                    query: ytQuery,
                    cleanedTitle,
                },
            })
        }
    }

    if (!cleanedTitle && track.url && !isSpotifyUrl) {
        const oembed = await fetchYoutubeOembedTitle(track.url)
        if (oembed?.title) {
            cleanedTitle = cleanTitle(oembed.title)
            cleanedAuthor = cleanAuthor(oembed.author)
            infoLog({
                message:
                    'Bridge: recovered title via YouTube oembed for fallback search',
                data: { url: track.url, title: cleanedTitle },
            })
        }
    }

    if (!cleanedTitle) {
        warnLog({
            message:
                'Bridge: yt-dlp failed and title is empty, cannot fallback',
            data: { url: track.url },
        })
        throw new Error('Bridge exhausted: no stream for empty title')
    }

    if (!providerHealthService.isAvailable('soundcloud')) {
        addBreadcrumb(
            'SoundCloud circuit open, skipping fallback',
            'music.youtube-extraction',
            'warning',
        )
        warnLog({
            message:
                'Bridge: SoundCloud circuit open, skipping fallback stages',
            data: {
                title: track.title,
                cleanedTitle,
                url: track.url,
            },
        })
        throw new Error(`Bridge exhausted: no stream for "${track.title}"`)
    }

    try {
        const stream = await streamViaSoundCloud(
            cleanSearchQuery(cleanedTitle, cleanedAuthor),
            track.duration,
        )
        stampFallbackStage(track, 'soundcloud-full')
        return stream
    } catch (primaryError) {
        debugLog({
            message:
                'Bridge: SoundCloud primary search failed, retrying with title only',
            data: {
                error: (primaryError as Error).message,
                cleanedTitle,
            },
        })
    }

    try {
        const stream = await streamViaSoundCloud(cleanedTitle, track.duration)
        stampFallbackStage(track, 'soundcloud-title')
        return stream
    } catch (titleOnlyError) {
        debugLog({
            message:
                'Bridge: title-only SoundCloud failed, retrying without parentheticals',
            data: {
                error: (titleOnlyError as Error).message,
                cleanedTitle,
            },
        })
    }

    const openParen = cleanedTitle.indexOf('(')
    const coreTitle =
        openParen > 0 ? cleanedTitle.slice(0, openParen).trim() : cleanedTitle
    if (coreTitle && coreTitle !== cleanedTitle) {
        try {
            const stream = await streamViaSoundCloud(coreTitle, track.duration)
            stampFallbackStage(track, 'soundcloud-core')
            return stream
        } catch (coreError) {
            const attemptedStages = [
                youtubeStage || 'yt-dlp',
                'soundcloud-full',
                'soundcloud-title',
                'soundcloud-core',
            ]
            captureMessage(
                'YouTube extraction exhausted all fallback stages',
                'warning',
                {
                    title: track.title,
                    url: safeUrlOrigin(track.url),
                    stages: attemptedStages,
                },
                {
                    category: 'music.youtube-extraction',
                    stage: 'all-exhausted',
                },
            )
            warnLog({
                message: 'Bridge: all stages exhausted',
                error: coreError,
                data: {
                    title: track.title,
                    cleanedTitle,
                    coreTitle,
                    url: track.url,
                    stages: attemptedStages,
                },
            })
        }
    } else {
        const attemptedStages = [
            youtubeStage || 'yt-dlp',
            'soundcloud-full',
            'soundcloud-title',
        ]
        captureMessage(
            'YouTube extraction exhausted all fallback stages',
            'warning',
            {
                title: track.title,
                url: safeUrlOrigin(track.url),
                stages: attemptedStages,
            },
            {
                category: 'music.youtube-extraction',
                stage: 'all-exhausted',
            },
        )
        warnLog({
            message: 'Bridge: all stages exhausted',
            data: {
                title: track.title,
                cleanedTitle,
                url: track.url,
                stages: attemptedStages,
            },
        })
    }

    throw new Error(`Bridge exhausted: no stream for "${track.title}"`)
}
