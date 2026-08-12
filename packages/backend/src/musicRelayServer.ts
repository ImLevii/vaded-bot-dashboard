import express, { type Express } from 'express'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { parseIntEnv } from '@lucky/shared/utils/env'
import { setupMiddleware } from './middleware'
import { setupMusicRoutes } from './routes/music'
import { setupHealthRoutes } from './routes/health'
import { requireAuth } from './middleware/auth'
import { requireGuildModuleAccess } from './middleware/guildAccess'
import { apiLimiter } from './middleware/rateLimit'
import { errorHandler } from './middleware/errorHandler'

const MUSIC_RELAY_PORT = parseIntEnv('MUSIC_RELAY_PORT', 3100)
const MUSIC_RELAY_HOST = process.env.MUSIC_RELAY_HOST ?? '0.0.0.0'

/**
 * Standalone Express process for the music-control API: playback/queue/state
 * routes plus the SSE state stream. This subtree needs a long-lived process
 * (a persistent Redis pub/sub subscription and an in-memory registry of open
 * SSE connections — see `routes/music/index.ts` and
 * `MusicControlService.sendCommand()`), so it can't run as a Vercel
 * serverless function alongside the rest of the dashboard API. It runs here
 * instead, colocated with the bot, and the dashboard's Vercel deployment
 * proxies `/api/guilds/:guildId/music/*` to this process (see vercel.json).
 */
export function createMusicRelayApp(): Express {
    const app = express()

    // Always behind a reverse proxy in every real deployment path (Vercel,
    // Cloudflare Tunnel, nginx) — gating this on NODE_ENV=production broke
    // express-rate-limit's IP resolution on hosts intentionally run with
    // NODE_ENV=development (e.g. for local-cookie behavior) while still
    // sitting behind a real proxy.
    app.set('trust proxy', 1)

    setupMiddleware(app)
    setupHealthRoutes(app)

    app.use('/api/', apiLimiter)
    app.use(
        '/api/guilds/:guildId/music',
        requireAuth,
        requireGuildModuleAccess('music'),
    )
    setupMusicRoutes(app)

    app.use(errorHandler)

    return app
}

export function startMusicRelay(): void {
    const app = createMusicRelayApp()

    const server = app.listen(MUSIC_RELAY_PORT, MUSIC_RELAY_HOST, () => {
        infoLog({
            message: `Music relay started on ${MUSIC_RELAY_HOST}:${MUSIC_RELAY_PORT}`,
        })
    })

    server.on('error', (error: Error & { code?: string }) => {
        errorLog({ message: 'Music relay error:', error })
        process.exit(1)
    })
}
