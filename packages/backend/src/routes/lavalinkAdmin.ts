import type { Express, Response as ExpressResponse } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireAdmin } from '../middleware/requireAdmin'
import { asyncHandler } from '../middleware/asyncHandler'
import { errorLog } from '@lucky/shared/utils'
import { vgMusicBotRequest } from '../services/vgMusicBotClient'

async function relay(
    res: ExpressResponse,
    path: string,
    init?: Parameters<typeof fetch>[1],
): Promise<void> {
    try {
        const upstream = await vgMusicBotRequest(path, init)
        if (upstream.status === 503 && upstream.body === null) {
            res.status(503).json({ error: 'vg-music-bot is not configured' })
            return
        }
        res.status(upstream.status).json(upstream.body)
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
