import type { Express, Request, Response } from 'express'
import http from 'node:http'
import https from 'node:https'
import { errorLog } from '@lucky/shared/utils'

/**
 * Forwards the music-control subtree (playback/queue/state + its SSE
 * stream) to the standalone relay process running alongside the bot (see
 * musicRelayServer.ts) instead of handling it locally. Used in place of
 * `setupMusicRoutes` when the app runs as a Vercel serverless function,
 * which can't hold the long-lived Redis pub/sub connection or SSE client
 * registry that subtree needs.
 *
 * Doing this inside the Express app (rather than a vercel.json rewrite)
 * avoids relying on how Vercel prioritizes rewrites against filesystem
 * Functions — this app is the single `/api/*` entrypoint regardless, and
 * decides internally whether to handle a request locally or forward it.
 *
 * Note: a Vercel function still has a maximum execution duration, so the
 * proxied SSE stream will be cut off periodically even though the relay
 * itself holds it open indefinitely. The frontend's EventSource client
 * reconnects automatically on drop, so this is a latency/reconnect
 * trade-off, not a correctness issue.
 */
export function setupMusicRelayProxy(app: Express): void {
    const target = process.env.MUSIC_RELAY_URL?.trim()

    app.use('/api/guilds/:guildId/music', (req: Request, res: Response) => {
        if (!target) {
            res.status(503).json({ error: 'Music relay not configured' })
            return
        }

        let targetUrl: URL
        try {
            targetUrl = new URL(req.originalUrl, target)
        } catch {
            res.status(502).json({ error: 'Invalid music relay target' })
            return
        }

        const client = targetUrl.protocol === 'https:' ? https : http
        const headers: http.OutgoingHttpHeaders = {
            ...req.headers,
            host: targetUrl.host,
        }

        // express.json() upstream already consumed the request stream and
        // parsed it into req.body — re-serialize rather than piping (the
        // underlying stream has nothing left to read).
        const hasBody =
            req.method !== 'GET' &&
            req.method !== 'HEAD' &&
            req.body &&
            typeof req.body === 'object' &&
            Object.keys(req.body).length > 0
        const bodyString = hasBody ? JSON.stringify(req.body) : undefined
        if (bodyString !== undefined) {
            headers['content-type'] = 'application/json'
            headers['content-length'] = Buffer.byteLength(bodyString)
        } else {
            delete headers['content-length']
        }

        const proxyReq = client.request(
            targetUrl,
            { method: req.method, headers },
            (proxyRes) => {
                res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
                proxyRes.pipe(res)
            },
        )

        proxyReq.on('error', (error) => {
            errorLog({ message: 'Music relay proxy error', error })
            if (!res.headersSent) {
                res.status(502).json({ error: 'Music relay unavailable' })
            } else {
                res.end()
            }
        })

        req.on('close', () => proxyReq.destroy())

        proxyReq.end(bodyString)
    })
}
