import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import {
    validateBody,
    validateParams,
    validateQuery,
} from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { z } from 'zod'
import { levelService } from '@lucky/shared/services'
import {
    guildIdParam,
    userIdParam as commonUserIdParam,
} from '../schemas/common'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

const leaderboardQuery = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    offset: z.coerce.number().int().min(0).optional(),
})

/** Discord snowflake, used for channel and role ids. */
const snowflake = z.string().regex(/^\d{17,20}$/, 'Must be a Discord ID')

const rankParams = guildIdParam.merge(commonUserIdParam)
const levelParam = guildIdParam.extend({
    level: z.coerce.number().int().min(1),
})

const upsertConfigBody = z.object({
    enabled: z.boolean().optional(),
    xpPerMessage: z.number().int().min(1).max(1000).optional(),
    xpCooldownMs: z.number().int().min(1000).optional(),
    // Nullable: clearing the picker means "no announce channel".
    announceChannel: snowflake.nullable().optional(),
    ignoredChannels: z.array(snowflake).max(100).optional(),
    ignoredRoles: z.array(snowflake).max(100).optional(),
    announceMode: z.enum(['channel', 'current', 'dm', 'off']).optional(),
    levelUpMessage: z.string().max(500).nullable().optional(),
    stackRewards: z.boolean().optional(),
})

const addRewardBody = z.object({
    level: z.number().int().min(1),
    roleId: z.string().min(1),
})

const adjustXpBody = z.object({
    userId: snowflake,
    // 'add' takes a delta (negative removes), 'set' writes an absolute value.
    mode: z.enum(['add', 'set']).default('add'),
    amount: z.number().int().min(-1_000_000).max(1_000_000),
})

export function setupLevelsRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/levels/config',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const config = await levelService.getConfig(guildId)
            res.json({ config })
        }),
    )

    app.patch(
        '/api/guilds/:guildId/levels/config',
        requireAuth,
        writeLimiter,
        validateParams(guildIdParam),
        validateBody(upsertConfigBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const data = upsertConfigBody.parse(req.body)
            const config = await levelService.upsertConfig(guildId, data)
            res.json({ config })
        }),
    )

    app.get(
        '/api/guilds/:guildId/levels/leaderboard',
        requireAuth,
        validateParams(guildIdParam),
        validateQuery(leaderboardQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const limit = Number(req.query.limit) || 10
            const offset = Number(req.query.offset) || 0
            // `total` lets the dashboard paginate; without it the page could
            // only ever show a fixed top-N with no way to reach the rest.
            const [leaderboard, total] = await Promise.all([
                levelService.getLeaderboard(
                    guildId,
                    Math.min(limit, 50),
                    Math.max(offset, 0),
                ),
                levelService.countMembers(guildId),
            ])
            res.json({ leaderboard, total })
        }),
    )

    app.get(
        '/api/guilds/:guildId/levels/rank/:userId',
        requireAuth,
        validateParams(rankParams),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = p(req.params.userId)
            const [memberXp, rank] = await Promise.all([
                levelService.getMemberXP(guildId, userId),
                levelService.getRank(guildId, userId),
            ])
            if (!memberXp) throw AppError.notFound('Member XP not found')
            res.json({ memberXp, rank })
        }),
    )

    app.get(
        '/api/guilds/:guildId/levels/rewards',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const rewards = await levelService.getRewards(guildId)
            res.json({ rewards })
        }),
    )

    app.post(
        '/api/guilds/:guildId/levels/rewards',
        requireAuth,
        writeLimiter,
        validateParams(guildIdParam),
        validateBody(addRewardBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { level, roleId } = addRewardBody.parse(req.body)
            const reward = await levelService.addReward(guildId, level, roleId)
            res.status(201).json({ reward })
        }),
    )

    app.delete(
        '/api/guilds/:guildId/levels/rewards/:level',
        requireAuth,
        writeLimiter,
        validateParams(levelParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const level = Number(req.params.level)
            await levelService.removeReward(guildId, level)
            res.json({ success: true })
        }),
    )

    // Manual XP correction. There was previously no way to fix a member's XP
    // short of editing the database by hand.
    app.post(
        '/api/guilds/:guildId/levels/xp',
        requireAuth,
        writeLimiter,
        validateParams(guildIdParam),
        validateBody(adjustXpBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { userId, amount, mode } = adjustXpBody.parse(req.body)
            const member = await levelService.adjustXP(
                guildId,
                userId,
                amount,
                mode,
            )
            res.json({ member })
        }),
    )

    // Guild-wide wipe: destructive and irreversible, hence its own route
    // rather than an option on the adjust endpoint.
    app.delete(
        '/api/guilds/:guildId/levels/xp',
        requireAuth,
        writeLimiter,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const removed = await levelService.resetGuildXP(guildId)
            res.json({ success: true, removed })
        }),
    )
}
