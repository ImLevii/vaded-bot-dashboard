import express, { type Express } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { parseIntEnv } from '@lucky/shared/utils/env'
import { setupRoutes, type SetupRoutesOptions } from './routes'
import { setupMiddleware } from './middleware'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const WEBAPP_PORT = parseIntEnv('PORT', parseIntEnv('WEBAPP_PORT', 3000))
const WEBAPP_HOST = process.env.WEBAPP_HOST ?? '0.0.0.0'
const isProduction = process.env.NODE_ENV === 'production'

/**
 * Builds the Express app without binding a port. Used both by
 * `startWebApp()` (Docker/homelab, below) and by the Vercel serverless
 * entrypoint (`api/[...path].ts`), which needs the bare request handler.
 */
export function createApp(routeOptions?: SetupRoutesOptions): Express {
    const app = express()

    // See musicRelayServer.ts's createMusicRelayApp() for why this isn't
    // gated on NODE_ENV=production.
    app.set('trust proxy', 1)

    setupMiddleware(app)
    setupRoutes(app, routeOptions)

    if (isProduction) {
        const frontendDistPath = path.join(__dirname, 'frontend', 'dist')
        app.use(express.static(frontendDistPath))
        app.get('/{*path}', (req, res, next) => {
            if (req.path === '/api' || req.path.startsWith('/api/')) {
                next()
                return
            }
            res.sendFile(path.join(frontendDistPath, 'index.html'))
        })
    }

    return app
}

export function startWebApp(): void {
    const app = createApp()

    const server = app.listen(WEBAPP_PORT, WEBAPP_HOST, () => {
        infoLog({
            message: `Web application started on ${WEBAPP_HOST}:${WEBAPP_PORT}`,
        })
    })

    server.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'EADDRINUSE') {
            const fallbackPort = WEBAPP_PORT + 1
            infoLog({
                message: `Port ${WEBAPP_PORT} in use, trying ${fallbackPort}...`,
            })
            app.listen(fallbackPort, WEBAPP_HOST, () => {
                infoLog({
                    message: `Web application started on ${WEBAPP_HOST}:${fallbackPort}`,
                })
            })
            return
        }
        errorLog({ message: 'Web application error:', error })
        process.exit(1)
    })
}
