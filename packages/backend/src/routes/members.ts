import type { Express, Response } from 'express'
import { z } from 'zod'
import { RBAC_MODULES, guildRoleAccessService } from '@lucky/shared/services'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { guildService } from '../services/GuildService'
import { guildIdParam } from '../schemas/common'

const userIdParam = guildIdParam.extend({
    userId: z.string().regex(/^\d{17,20}$/, 'Invalid user ID'),
})

const userGrantSchema = z
    .object({
        module: z.enum(RBAC_MODULES),
        mode: z.enum(['view', 'manage', 'none']),
    })
    .strict()

const userGrantsUpdateSchema = z
    .object({
        grants: z.array(userGrantSchema).max(100),
    })
    .strict()

type UserGrantsUpdateInput = z.infer<typeof userGrantsUpdateSchema>
type UserGrantInput = UserGrantsUpdateInput['grants'][number]
type PersistedUserGrantInput = Omit<UserGrantInput, 'mode'> & { mode: 'view' | 'manage' }

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export function setupMembersRoutes(app: Express): void {
    /** List guild members with their roles and current effective access. */
    app.get(
        '/api/guilds/:guildId/members',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const members = await guildService.getGuildMembers(guildId)
            const userGrants = await guildRoleAccessService.listUserGrants(guildId)

            // Group user grants by userId for quick lookup
            const grantsByUser = new Map<string, Array<{ module: string; mode: string }>>()
            for (const g of userGrants) {
                const list = grantsByUser.get(g.userId) ?? []
                list.push({ module: g.module, mode: g.mode })
                grantsByUser.set(g.userId, list)
            }

            const result = members.map((m) => ({
                ...m,
                userGrants: grantsByUser.get(m.id) ?? [],
            }))

            res.json({ members: result })
        }),
    )

    /** Get user grants for a specific guild member. */
    app.get(
        '/api/guilds/:guildId/members/:userId/grants',
        requireAuth,
        validateParams(userIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = p(req.params.userId)
            const grants = await guildRoleAccessService.listUserGrants(guildId)
            const userGrants = grants.filter((g) => g.userId === userId)
            res.json({ grants: userGrants })
        }),
    )

    /** Replace user grants for a specific guild member. */
    app.put(
        '/api/guilds/:guildId/members/:userId/grants',
        requireAuth,
        writeLimiter,
        validateParams(userIdParam),
        validateBody(userGrantsUpdateSchema),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            if (!req.user) throw AppError.unauthorized()
            const guildId = p(req.params.guildId)
            const userId = p(req.params.userId)
            const body = userGrantsUpdateSchema.parse(req.body) as UserGrantsUpdateInput

            // Only allow module modes 'view' and 'manage'; 'none' means remove
            const toSave = body.grants
                .filter(
                    (g): g is PersistedUserGrantInput => g.mode === 'view' || g.mode === 'manage',
                )
                .map((g) => ({
                    module: g.module,
                    mode: g.mode,
                }))

            await guildRoleAccessService.replaceUserGrants(guildId, userId, toSave)
            res.json({ ok: true })
        }),
    )

    /** Clear all user grants for a specific guild member. */
    app.delete(
        '/api/guilds/:guildId/members/:userId/grants',
        requireAuth,
        writeLimiter,
        validateParams(userIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            if (!req.user) throw AppError.unauthorized()
            const guildId = p(req.params.guildId)
            const userId = p(req.params.userId)
            await guildRoleAccessService.clearUserGrants(guildId, userId)
            res.json({ ok: true })
        }),
    )
}
