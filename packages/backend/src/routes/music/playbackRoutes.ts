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

const playBodySchema = z.object({
    query: z.string().min(1),
    voiceChannelId: z.string().min(1).optional(),
})

const volumeBodySchema = z.object({
    volume: z.number().min(0).max(100),
})

const repeatBodySchema = z.object({
    mode: z.enum(['off', 'track', 'queue', 'autoplay']),
})

const seekBodySchema = z.object({
    position: z.number().min(0),
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

async function patchPlayer(
    guildId: string,
    body: Record<string, unknown>,
): Promise<MusicCommandResult> {
    const res = await vgMusicBotRequest(
        `/v1/players/${encodeURIComponent(guildId)}`,
        {
            method: 'PATCH',
            body: JSON.stringify(body),
        },
    )
    if (res.ok) return result(guildId, true)
    const error =
        (res.body as { error?: string } | null)?.error ?? 'Command failed'
    return result(guildId, false, error)
}

export function setupPlaybackRoutes(app: Express): void {
    app.post(
        '/api/guilds/:guildId/music/play',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            const body = playBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('Query is required')
            }

            // Idempotent: vg-music-bot 400s if a player already exists for
            // this guild, which is fine — we only need one to exist before
            // queueing the track.
            await vgMusicBotRequest('/v1/players', {
                method: 'POST',
                body: JSON.stringify({ guildId, userId }),
            })

            res.json(await patchPlayer(guildId, { add: [body.data.query] }))
        }),
    )

    const simpleCommands: Record<string, Record<string, unknown>> = {
        pause: { pause: true },
        resume: { pause: false },
        skip: { skipMode: 'skip' },
        previous: { skipMode: 'previous' },
        shuffle: { shuffle: true },
    }
    for (const [command, body] of Object.entries(simpleCommands)) {
        app.post(
            `/api/guilds/:guildId/music/${command}`,
            requireAuth,
            validateParams(guildIdParam),
            asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
                const guildId = param(req.params.guildId)
                requireUserId(req)
                res.json(await patchPlayer(guildId, body))
            }),
        )
    }

    app.post(
        '/api/guilds/:guildId/music/stop',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            requireUserId(req)
            const upstream = await vgMusicBotRequest(
                `/v1/players/${encodeURIComponent(guildId)}`,
                { method: 'DELETE' },
            )
            res.json(result(guildId, upstream.ok))
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/volume',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            requireUserId(req)
            const body = volumeBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('Volume must be 0-100')
            }

            res.json(await patchPlayer(guildId, { volume: body.data.volume }))
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/repeat',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            requireUserId(req)
            const body = repeatBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest(
                    'Mode must be off, track, queue, or autoplay',
                )
            }

            const patch: Record<string, unknown> =
                body.data.mode === 'autoplay'
                    ? { autoplay: true }
                    : body.data.mode === 'track'
                      ? { loop: 'song', autoplay: false }
                      : body.data.mode === 'queue'
                        ? { loop: 'queue', autoplay: false }
                        : { loop: 'none', autoplay: false }

            res.json(await patchPlayer(guildId, patch))
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/seek',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            requireUserId(req)
            const body = seekBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest(
                    'Position must be a positive number (ms)',
                )
            }

            res.json(
                await patchPlayer(guildId, { position: body.data.position }),
            )
        }),
    )
}
