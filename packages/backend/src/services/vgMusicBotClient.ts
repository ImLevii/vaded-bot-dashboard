/**
 * Thin client for vg-music-bot's own Fastify web API (see
 * vg-music-bot/src/web/ in this repo) — the bot that actually joins voice
 * and plays music. Used both by the Lavalink node admin panel and by the
 * music control/state routes, which proxy directly to it instead of the
 * old Redis pub/sub bridge.
 */
export interface VgMusicBotResponse<T = unknown> {
    ok: boolean
    status: number
    body: T | null
}

export function vgMusicBotConfigured(): boolean {
    return Boolean(
        process.env.VG_MUSIC_BOT_URL?.trim() &&
        process.env.VG_MUSIC_BOT_TOKEN?.trim(),
    )
}

export async function vgMusicBotRequest<T = unknown>(
    path: string,
    init?: Parameters<typeof fetch>[1],
): Promise<VgMusicBotResponse<T>> {
    const base = process.env.VG_MUSIC_BOT_URL?.trim()
    const token = process.env.VG_MUSIC_BOT_TOKEN?.trim()
    if (!base || !token) {
        return { ok: false, status: 503, body: null }
    }

    const res = await fetch(new URL(path, base), {
        ...init,
        headers: {
            ...init?.headers,
            authorization: token,
            ...(init?.body ? { 'content-type': 'application/json' } : {}),
        },
    })
    const body = (await res.json().catch(() => null)) as T | null
    return { ok: res.ok, status: res.status, body }
}
