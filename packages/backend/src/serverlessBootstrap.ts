import type { Express } from 'express'
import {
    ensureEnvironment,
    validateBackendEnvironment,
} from '@lucky/shared/config'
import { redisClient } from '@lucky/shared/services'
import {
    initializeSentry,
    setupErrorHandlers,
    verifyRequiredDatabaseRelations,
    warnLog,
} from '@lucky/shared/utils'
import { createApp } from './server'

let appPromise: Promise<Express> | null = null

async function initialize(): Promise<Express> {
    await ensureEnvironment()
    validateBackendEnvironment()
    setupErrorHandlers()
    initializeSentry({
        appName: 'vaded',
        serviceName: 'backend',
        release: process.env.SENTRY_RELEASE || process.env.COMMIT_SHA,
        serverName: process.env.HOSTNAME,
        tags: { runtime: 'vercel' },
    })
    await verifyRequiredDatabaseRelations()

    try {
        const connected = await redisClient.connect()
        if (!connected) {
            warnLog({
                message:
                    'Redis shared client unavailable. Serverless backend starting with fallback behavior.',
            })
        }
    } catch (error) {
        warnLog({
            message:
                'Redis shared client connection failed. Serverless backend starting with fallback behavior.',
            error,
        })
    }

    return createApp({ includeMusic: false })
}

/**
 * Builds (once) and returns the Express app for the Vercel serverless
 * entrypoint (`api/[...path].ts`). Module-level state persists across
 * invocations that land on the same warm container, so this only re-runs
 * the connect/verify work on an actual cold start — not per request.
 */
export function getServerlessApp(): Promise<Express> {
    if (!appPromise) {
        appPromise = initialize().catch((error: unknown) => {
            // Don't cache a permanently rejected promise for the life of the
            // container — let the next request retry initialization.
            appPromise = null
            throw error
        })
    }
    return appPromise
}
