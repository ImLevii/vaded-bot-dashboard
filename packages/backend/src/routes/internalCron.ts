import type { Express, Request, Response } from 'express'
import { getPrismaClient } from '@lucky/shared/utils'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { timingSafeKeyCompare } from '../utils/timingSafeKeyCompare'
import { PrismaSessionStore } from '../middleware/prismaSessionStore'

function requireCronKey(req: Request): void {
    // Vercel signs its own Cron requests with this header — see
    // https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
    // CRON_API_KEY lets the same endpoint be triggered manually (e.g. from
    // the Docker/homelab deployment, which has no Vercel Cron scheduler).
    const vercelCronHeader = req.header('authorization')?.trim()
    const expectedVercelHeader = process.env.CRON_SECRET
        ? `Bearer ${process.env.CRON_SECRET}`
        : undefined
    if (
        expectedVercelHeader &&
        timingSafeKeyCompare(vercelCronHeader, expectedVercelHeader)
    ) {
        return
    }

    const provided = req.header('x-cron-key')?.trim()
    const expected = process.env.CRON_API_KEY?.trim()
    if (!timingSafeKeyCompare(provided, expected)) {
        throw AppError.unauthorized('invalid cron key')
    }
}

/**
 * The Postgres-backed session store normally prunes expired rows via an
 * internal setInterval (see prismaSessionStore.ts), which only makes sense
 * on a long-lived process. On Vercel that timer is disabled and this route
 * is hit by a Vercel Cron entry (vercel.json) instead.
 */
export function setupInternalCronRoutes(app: Express): void {
    // GET, not POST: Vercel Cron Jobs only ever issue GET requests to the
    // configured path (https://vercel.com/docs/cron-jobs/manage-cron-jobs).
    app.get(
        '/api/internal/prune-sessions',
        writeLimiter,
        asyncHandler(async (req: Request, res: Response) => {
            requireCronKey(req)
            const store = new PrismaSessionStore(getPrismaClient())
            await store.prune()
            store.stopPruning()
            res.status(204).send()
        }),
    )
}
