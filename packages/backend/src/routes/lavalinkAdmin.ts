import type { Express, Response as ExpressResponse } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireAdmin } from '../middleware/requireAdmin'
import { asyncHandler } from '../middleware/asyncHandler'
import { errorLog } from '@lucky/shared/utils'

/**
 * Proxies Lavalink node management to vg-music-bot's own web API (see
 * src/web/lavalink.ts in that project) rather than reimplementing node
 * state here — vg-music-bot is a separate bot process and the source of
 * truth for its own Rainlink node manager.
 */
function vgMusicBotRequest(
    path: string,
    init?: Parameters<typeof fetch>[1],
): Promise<Response> | null {
    const base = process.env.VG_MUSIC_BOT_URL?.trim()
    const token = process.env.VG_MUSIC_BOT_TOKEN?.trim()
    if (!base || !token) return null

    return fetch(new URL(path, base), {
        ...init,
        headers: {
            ...init?.headers,
            authorization: token,
            ...(init?.body ? { 'content-type': 'application/json' } : {}),
        },
    }) as unknown as Promise<Response>
}

async function relay(
    res: ExpressResponse,
    path: string,
    init?: Parameters<typeof fetch>[1],
): Promise<void> {
    const upstream = vgMusicBotRequest(path, init)
    if (!upstream) {
        res.status(503).json({ error: 'vg-music-bot is not configured' })
        return
    }

    try {
        const upstreamRes = await upstream
        const body = await upstreamRes.json().catch(() => null)
        res.status(upstreamRes.status).json(body)
    } catch (error) {
        errorLog({ message: 'vg-music-bot lavalink proxy error', error })
        res.status(502).json({ error: 'vg-music-bot unavailable' })
    }
}

export function setupLavalinkAdminRoutes(app: Express): void {
    app.get(
        '/api/admin/lavalink/nodes',
        requireAuth,
        requireAdmin,
        asyncHandler(
            async (_req: AuthenticatedRequest, res: ExpressResponse) => {
                await relay(res, '/v1/lavalink/nodes')
            },
        ),
    )

    app.post(
        '/api/admin/lavalink/nodes',
        requireAuth,
        requireAdmin,
        asyncHandler(
            async (req: AuthenticatedRequest, res: ExpressResponse) => {
                await relay(res, '/v1/lavalink/nodes', {
                    method: 'POST',
                    body: JSON.stringify(req.body),
                })
            },
        ),
    )

    app.delete(
        '/api/admin/lavalink/nodes/:name',
        requireAuth,
        requireAdmin,
        asyncHandler(
            async (req: AuthenticatedRequest, res: ExpressResponse) => {
                await relay(
                    res,
                    `/v1/lavalink/nodes/${encodeURIComponent(String(req.params.name))}`,
                    {
                        method: 'DELETE',
                    },
                )
            },
        ),
    )

    app.post(
        '/api/admin/lavalink/nodes/:name/switch',
        requireAuth,
        requireAdmin,
        asyncHandler(
            async (req: AuthenticatedRequest, res: ExpressResponse) => {
                await relay(
                    res,
                    `/v1/lavalink/nodes/${encodeURIComponent(String(req.params.name))}/switch`,
                    {
                        method: 'POST',
                        body: JSON.stringify(req.body),
                    },
                )
            },
        ),
    )
}
