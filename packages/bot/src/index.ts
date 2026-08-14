import { ensureEnvironment } from '@lucky/shared/config'
import {
    setupErrorHandlers,
    flushSentry,
    initializeSentry,
    debugLog,
    errorLog,
    sanitizeErrorMessage,
    sanitizeStack,
} from '@lucky/shared/utils'

let isShuttingDown = false

// `./bot/start` transitively imports `@lucky/shared/services`, whose barrel
// eagerly constructs a Prisma client at module-load time (AutoMessageService).
// A static top-level import here would evaluate that before ensureEnvironment()
// below ever runs, throwing "DATABASE_URL ... is required" on every standalone
// bot start. Load it dynamically, after env is guaranteed to be loaded, the
// same way packages/backend/src/index.ts defers its ./bootstrap import.
let shutdownBot: () => Promise<void>

async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
        debugLog({ message: `${signal} already in progress, ignoring` })
        return
    }

    isShuttingDown = true
    debugLog({ message: `Received ${signal}, initiating graceful shutdown...` })

    try {
        if (shutdownBot) {
            await shutdownBot()
            debugLog({ message: 'Bot shutdown completed' })
        }
    } catch (error) {
        errorLog({ message: `Error during ${signal} shutdown:`, error })
    }

    try {
        await flushSentry(3000)
    } catch (error) {
        errorLog({ message: 'Error flushing Sentry:', error })
    }

    process.exit(0)
}

async function main(): Promise<void> {
    await ensureEnvironment()

    setupErrorHandlers()
    initializeSentry({
        appName: 'vaded',
        serviceName: 'bot',
        // || not ??: compose sets SENTRY_RELEASE to "" when unset, which is
        // not nullish and would block the COMMIT_SHA fallback (#release-empty)
        release: process.env.SENTRY_RELEASE || process.env.COMMIT_SHA,
        serverName: process.env.SENTRY_SERVER_NAME ?? process.env.HOSTNAME,
        environment: process.env.SENTRY_ENVIRONMENT,
        tags: {
            runtime: 'discord-bot',
        },
    })

    if (process.env.DEPENDENCY_CHECK_ENABLED === 'true') {
        const { dependencyCheckService } =
            await import('./services/DependencyCheckService')
        dependencyCheckService.start()
    }

    debugLog({
        message: `Starting bot in environment: ${process.env.NODE_ENV ?? 'default'}`,
    })

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))

    const { initializeBot, shutdown } = await import('./bot/start')
    shutdownBot = shutdown

    const result = await initializeBot()
    if (!result.success) {
        // Throw into main().catch (Sentry flush + exit(1)) — returning here
        // leaves a zombie process the restart policy can never revive (#1649)
        throw new Error(result.error ?? 'Bot initialization failed')
    }
}

main().catch(async (error: unknown) => {
    errorLog({ message: 'Failed to start bot:', error })
    if (error instanceof Error) {
        errorLog({ message: 'Error name:', data: error.name })
        errorLog({ message: 'Error message:', data: error.message })
        errorLog({
            message: 'Error stack (sanitized):',
            data: sanitizeStack(error) ?? sanitizeErrorMessage(error),
        })
    }

    try {
        await flushSentry(3000)
    } finally {
        process.exit(1)
    }
})
