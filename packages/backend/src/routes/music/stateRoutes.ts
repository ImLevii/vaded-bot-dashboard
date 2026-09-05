import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { validateParams } from '../../middleware/validate'
import { guildIdParam } from '../../schemas/common'
import { param, sseClients } from './helpers'
import { fetchQueueState, emptyQueueState } from './vgMusicBotState'
import { AppError } from '../../errors/AppError'

const POLL_INTERVAL_MS = 2000
const pollers = new Map<string, ReturnType<typeof setInterval>>()
const pendingPolls = new Set<string>()

async function stateEvent(guildId: string): Promise<string> {
    try {
        const state =
            (await fetchQueueState(guildId)) ?? emptyQueueState(guildId)
        return `data: ${JSON.stringify(state)}\n\n`
    } catch (error) {
        // Opening an SSE transport does not mean the upstream bot is healthy.
        const message =
            error instanceof AppError
                ? error.message
                : 'Music service unavailable'
        return `data: ${JSON.stringify({ type: 'music_unavailable', error: message })}\n\n`
    }
}

export function setupStateRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/music/stream',
        requireAuth,
        validateParams(guildIdParam),
        async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            let closed = false
            // Request completion may precede an SSE response in serverless adapters.
            res.on('close', () => {
                closed = true
                const clients = sseClients.get(guildId)
                clients?.delete(res)
                if (clients && clients.size === 0) {
                    sseClients.delete(guildId)
                    clearInterval(pollers.get(guildId))
                    pollers.delete(guildId)
                }
            })
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
            })
            const initial = await stateEvent(guildId)
            if (closed) return
            try {
                res.write(initial)
            } catch {
                return
            }
            let clients = sseClients.get(guildId)
            if (!clients) {
                clients = new Set()
                sseClients.set(guildId, clients)
            }
            clients.add(res)
            if (!pollers.has(guildId)) {
                pollers.set(
                    guildId,
                    setInterval(
                        () => void broadcastState(guildId),
                        POLL_INTERVAL_MS,
                    ),
                )
            }
        },
    )
    app.get(
        '/api/guilds/:guildId/music/state',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            res.json(
                (await fetchQueueState(guildId)) ?? emptyQueueState(guildId),
            )
        }),
    )
}

async function broadcastState(guildId: string): Promise<void> {
    if (!sseClients.get(guildId)?.size || pendingPolls.has(guildId)) return
    pendingPolls.add(guildId)
    try {
        const data = await stateEvent(guildId)
        for (const client of sseClients.get(guildId) ?? []) {
            try {
                client.write(data)
            } catch {
                // The connection close handler removes disconnected clients.
            }
        }
    } finally {
        pendingPolls.delete(guildId)
    }
}
