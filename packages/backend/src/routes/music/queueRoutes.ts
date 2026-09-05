import type { Express, Response } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { validateParams } from '../../middleware/validate'
import { guildIdParam } from '../../schemas/common'
import { AppError } from '../../errors/AppError'
import { vgMusicBotRequest } from '../../services/vgMusicBotClient'
import type { MusicCommandResult } from '@lucky/shared/services'
import { param } from './helpers'
import { fetchQueueState } from './vgMusicBotState'

const moveQueueBodySchema = z.object({
    from: z.number().int().min(0).max(9999),
    to: z.number().int().min(0).max(9999),
})

const removeQueueBodySchema = z.object({
    index: z.number().int().min(0).max(9999),
})

const importBodySchema = z.object({
    url: z.string().min(1),
    voiceChannelId: z.string().min(1).optional(),
})

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

function result(
    guildId: string,
    success: boolean,
    error?: string,
): MusicCommandResult {
    return {
        id: `cmd_${Date.now()}`,
        guildId,
        success,
        error,
        timestamp: Date.now(),
    }
}

export function setupQueueRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/music/queue',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const state = await fetchQueueState(guildId)
            res.json({
                currentTrack: state?.currentTrack ?? null,
                tracks: state?.tracks ?? [],
                total: state?.tracks.length ?? 0,
            })
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/queue/move',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            requireUserId(req)
            const body = moveQueueBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('From and to positions are required')
            }

            const upstream = await vgMusicBotRequest(
                `/v1/players/${encodeURIComponent(guildId)}/queue/move`,
                { method: 'POST', body: JSON.stringify(body.data) },
            )
            res.json(
                result(
                    guildId,
                    upstream.ok,
                    upstream.ok ? undefined : 'Move failed',
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/queue/remove',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            requireUserId(req)
            const body = removeQueueBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('Track index is required')
            }

            const upstream = await vgMusicBotRequest(
                `/v1/players/${encodeURIComponent(guildId)}/queue/remove`,
                { method: 'POST', body: JSON.stringify(body.data) },
            )
            res.json(
                result(
                    guildId,
                    upstream.ok,
                    upstream.ok ? undefined : 'Remove failed',
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/queue/clear',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            requireUserId(req)
            const upstream = await vgMusicBotRequest(
                `/v1/players/${encodeURIComponent(guildId)}/queue/clear`,
                { method: 'POST' },
            )
            res.json(
                result(
                    guildId,
                    upstream.ok,
                    upstream.ok ? undefined : 'Clear failed',
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/import',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            requireUserId(req)
            const body = importBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('Playlist URL is required')
            }

            const upstream = await vgMusicBotRequest(
                `/v1/players/${encodeURIComponent(guildId)}/queue/import`,
                {
                    method: 'POST',
                    body: JSON.stringify({ url: body.data.url }),
                },
            )
            res.json(
                result(
                    guildId,
                    upstream.ok,
                    upstream.ok ? undefined : 'Import failed',
                ),
            )
        }),
    )
}
