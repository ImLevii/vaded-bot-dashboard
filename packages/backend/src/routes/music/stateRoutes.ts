import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { validateParams } from '../../middleware/validate'
import { guildIdParam } from '../../schemas/common'
import { param, sseClients } from './helpers'
import { fetchQueueState, emptyQueueState } from './vgMusicBotState'

const POLL_INTERVAL_MS = 2000

export function setupStateRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/music/stream',
        requireAuth,
        validateParams(guildIdParam),
        async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
            })

            const currentState = await fetchQueueState(guildId)
            try {
                res.write(
                    `data: ${JSON.stringify(currentState ?? emptyQueueState(guildId))}\n\n`,
                )
            } catch {
                // NOSONAR: client disconnected before initial state send.
                return
            }

            let clients = sseClients.get(guildId)
            if (!clients) {
                clients = new Set()
                sseClients.set(guildId, clients)
            }
            clients.add(res)

            // Only one poller per guild regardless of how many browser tabs
            // are watching it — the first SSE client for a guild starts it,
            // the last one to disconnect stops it.
            if (!pollers.has(guildId)) {
                pollers.set(
                    guildId,
                    setInterval(
                        () => broadcastState(guildId),
                        POLL_INTERVAL_MS,
                    ),
                )
            }

            req.on('close', () => {
                const guildClients = sseClients.get(guildId)
                guildClients?.delete(res)

                if (guildClients && guildClients.size === 0) {
                    sseClients.delete(guildId)
                    const poller = pollers.get(guildId)
                    if (poller) clearInterval(poller)
                    pollers.delete(guildId)
                }
            })
        },
    )

    app.get(
        '/api/guilds/:guildId/music/state',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const state = await fetchQueueState(guildId)
            res.json(state ?? emptyQueueState(guildId))
        }),
    )
}

const pollers = new Map<string, ReturnType<typeof setInterval>>()

async function broadcastState(guildId: string): Promise<void> {
    const clients = sseClients.get(guildId)
    if (!clients?.size) return

    const state = (await fetchQueueState(guildId)) ?? emptyQueueState(guildId)
    const data = `data: ${JSON.stringify(state)}\n\n`
    for (const client of clients) {
        try {
            client.write(data)
        } catch {
            // NOSONAR: client disconnected mid-broadcast; close handler cleans it up.
        }
    }
}
