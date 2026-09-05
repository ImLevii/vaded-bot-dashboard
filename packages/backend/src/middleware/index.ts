import express, { type Express } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { existsSync } from 'node:fs'
import path from 'path'
import { setupSessionMiddleware } from './session'
import { requestId } from './requestId'
import { requestLogger } from './requestLogger'
import { metricsMiddleware } from './metrics'
import { getFrontendOrigins } from '../utils/frontendOrigin'

export function setupMiddleware(app: Express): void {
    const configuredOrigins = getFrontendOrigins()
    const isProduction = process.env.NODE_ENV === 'production'

    // Always behind a reverse proxy in every real deployment path (Vercel,
    // Cloudflare Tunnel, nginx) — gating this on NODE_ENV=production broke
    // express-rate-limit's IP resolution on hosts intentionally run with
    // NODE_ENV=development while still sitting behind a real proxy.
    app.set('trust proxy', 1)

    app.use(
        helmet({
            // Same enforced CSP as the serving edges (vercel.json /
            // nginx) — the backend serves the SPA index.html fallback in
            // production (server.ts), so it must carry the same policy.
            // Flipped from Report-Only to enforce (PR 2 of #1283) after a
            // measurement window with zero violations across Sentry + the
            // /api/security/csp-report sink. report-uri stays on so blocked
            // resources keep reporting. See
            // decisions/2026-06-11-security-headers-placement.md
            contentSecurityPolicy: {
                useDefaults: false,
                reportOnly: false,
                directives: {
                    'default-src': ["'self'"],
                    'script-src': [
                        "'self'",
                        'https://static.cloudflareinsights.com',
                    ],
                    'style-src': [
                        "'self'",
                        "'unsafe-inline'",
                        'https://fonts.googleapis.com',
                    ],
                    'font-src': [
                        "'self'",
                        'data:',
                        'https://fonts.gstatic.com',
                    ],
                    'img-src': [
                        "'self'",
                        'data:',
                        'blob:',
                        'https://cdn.discordapp.com',
                        'https://cdn.discord.com',
                        // Track artwork the bridge can resolve tracks through
                        // (see streamBridge.ts) — thumbnails render directly
                        // from whichever source matched.
                        'https://i.ytimg.com',
                        'https://*.sndcdn.com',
                        'https://i.scdn.co',
                        // Spotify's newer per-region edge CDN (e.g.
                        // image-cdn-ak.spotifycdn.com) -- a different
                        // domain than the legacy i.scdn.co above.
                        'https://*.spotifycdn.com',
                    ],
                    'connect-src': [
                        "'self'",
                        'https://api.vaded.gg',
                        'https://*.sentry.io',
                    ],
                    'worker-src': ["'self'", 'blob:'],
                    'frame-ancestors': ["'none'"],
                    'base-uri': ["'self'"],
                    'form-action': ["'self'"],
                    'object-src': ["'none'"],
                    'report-uri': ['/api/security/csp-report'],
                },
            },
            // TLS terminates at the Cloudflare Tunnel, which owns HSTS;
            // this app only ever sees plain HTTP behind the proxy
            hsts: false,
            frameguard: { action: 'deny' },
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
            // API images (e.g. support-report attachments) are embedded by
            // the web origin; same-origin CORP would block those loads
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }),
    )

    const isAllowedOrigin = (origin: string): boolean => {
        if (configuredOrigins.includes(origin)) {
            return true
        }

        try {
            const parsed = new URL(origin)
            const host = parsed.hostname.toLowerCase()

            // Localhost is only trusted off-production (local dev); never allow
            // it as a credentialed cross-origin in prod.
            if (
                !isProduction &&
                (host === 'localhost' || host === '127.0.0.1')
            ) {
                return true
            }

            // Only first-party production hosts. Multi-tenant dev platforms
            // (replit.dev / repl.co / replit.app) are NOT trusted with
            // credentials — see ADR 2026-06-05-csrf-posture.
            return (
                host === 'vaded.gg' ||
                host.endsWith('.vaded.gg') ||
                host === 'vaded-bot-dashboard.vercel.app' ||
                host.endsWith('.vercel.app')
            )
        } catch {
            return false
        }
    }

    app.use(
        cors({
            origin: (origin, callback) => {
                if (!origin || isAllowedOrigin(origin)) {
                    callback(null, true)
                    return
                }

                callback(new Error('Not allowed by CORS'))
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        }),
    )

    app.use(requestId)
    app.use(requestLogger)
    app.use(metricsMiddleware)
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    app.use(cookieParser())
    setupSessionMiddleware(app)

    if (isProduction) {
        // All-in-one Docker image copies the frontend build here (Dockerfile:
        // `COPY --from=build-frontend .../frontend/dist ./packages/backend/dist/frontend/dist`).
        // The other two are older/alternate layouts, kept as fallbacks.
        const dockerAllInOnePath = path.join(
            process.cwd(),
            'packages',
            'backend',
            'dist',
            'frontend',
            'dist',
        )
        const monorepoPublicPath = path.join(
            process.cwd(),
            'packages',
            'backend',
            'public',
        )
        const localPublicPath = path.join(process.cwd(), 'public')
        const staticPath = existsSync(dockerAllInOnePath)
            ? dockerAllInOnePath
            : existsSync(monorepoPublicPath)
              ? monorepoPublicPath
              : localPublicPath

        app.use(express.static(staticPath))
    }
}
