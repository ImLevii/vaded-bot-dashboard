import { AppError } from '../errors/AppError'

/** HTTP client for the music bot hosted separately from the dashboard. */
export interface VgMusicBotResponse<T = unknown> {
    ok: boolean
    status: number
    body: T | null
    error?: string
}

export const MUSIC_BOT_TIMEOUT_MS = 8000
export const MUSIC_BOT_CONFIGURATION_ERROR =
    'Music service is not configured. Set VG_MUSIC_BOT_URL and VG_MUSIC_BOT_TOKEN in the dashboard deployment.'

export function vgMusicBotConfigured(): boolean {
    return Boolean(
        process.env.VG_MUSIC_BOT_URL?.trim() &&
        process.env.VG_MUSIC_BOT_TOKEN?.trim(),
    )
}

export function vgMusicBotError(
    response: VgMusicBotResponse,
    fallback = 'Music service unavailable',
): AppError {
    if (response.status === 401 || response.status === 403) {
        return AppError.badGateway(
            'The music bot rejected the dashboard credentials. Check that VG_MUSIC_BOT_TOKEN matches the bot API token.',
        )
    }
    const body = response.body as { error?: unknown } | null
    const message =
        response.error ??
        (typeof body?.error === 'string' ? body.error.slice(0, 500) : fallback)
    return new AppError(response.status >= 400 ? response.status : 502, message)
}

export async function vgMusicBotRequest<T = unknown>(
    path: string,
    init?: Parameters<typeof fetch>[1],
): Promise<VgMusicBotResponse<T>> {
    const base = process.env.VG_MUSIC_BOT_URL?.trim()
    const token = process.env.VG_MUSIC_BOT_TOKEN?.trim()
    if (!base || !token) {
        return {
            ok: false,
            status: 503,
            body: null,
            error: MUSIC_BOT_CONFIGURATION_ERROR,
        }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MUSIC_BOT_TIMEOUT_MS)
    try {
        const url = new URL(path, base)
        if (!['http:', 'https:'].includes(url.protocol)) {
            return {
                ok: false,
                status: 503,
                body: null,
                error: 'VG_MUSIC_BOT_URL must be an HTTP or HTTPS URL for the music bot API.',
            }
        }
        const headers = new Headers(init?.headers)
        headers.set('authorization', token)
        if (init?.body) headers.set('content-type', 'application/json')
        const res = await fetch(url, {
            ...init,
            headers,
            redirect: 'error',
            signal: init?.signal
                ? AbortSignal.any([controller.signal, init.signal])
                : controller.signal,
        })
        const body = (await res.json().catch(() => null)) as T | null
        controller.signal.throwIfAborted()
        return { ok: res.ok, status: res.status, body }
    } catch {
        return {
            ok: false,
            status: controller.signal.aborted ? 504 : 502,
            body: null,
            error: controller.signal.aborted
                ? 'The music bot did not respond in time. Check that its API port is reachable from the dashboard.'
                : 'The dashboard cannot reach the music bot API. Check its address, port, and running status.',
        }
    } finally {
        clearTimeout(timer)
    }
}
