import {
    ensureEnvironment,
    validateBackendEnvironment,
} from '@lucky/shared/config'
import { redisClient } from '@lucky/shared/services'
import {
    initializeSentry,
    setupErrorHandlers,
    verifyRequiredDatabaseRelations,
    errorLog,
} from '@lucky/shared/utils'
import { startMusicRelay } from './musicRelayServer'

export async function bootstrapMusicRelay(): Promise<void> {
    await ensureEnvironment()
    validateBackendEnvironment()
    setupErrorHandlers()
    initializeSentry({
        appName: 'vaded',
        serviceName: 'music-relay',
        release: process.env.SENTRY_RELEASE || process.env.COMMIT_SHA,
        serverName: process.env.HOSTNAME,
        tags: { runtime: 'express' },
    })
    await verifyRequiredDatabaseRelations()

    // Unlike the main backend, the relay's only job is the Redis pub/sub
    // bridge to the bot — there's nothing useful it can do without Redis, so
    // fail fast instead of starting in a permanently-degraded state.
    const connected = await redisClient.connect()
    if (!connected) {
        errorLog({
            message:
                'Music relay cannot start: Redis is required and unavailable.',
        })
        process.exit(1)
    }

    startMusicRelay()
}
