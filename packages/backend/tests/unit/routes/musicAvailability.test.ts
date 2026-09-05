import express from 'express'
import request from 'supertest'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import { AppError } from '../../../src/errors/AppError'

jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (req: any, _res: unknown, next: () => void) => {
        req.userId = '123456789012345678'
        next()
    },
}))
jest.mock('../../../src/services/vgMusicBotClient', () => {
    const actual = jest.requireActual('../../../src/services/vgMusicBotClient')
    return { ...actual, vgMusicBotRequest: jest.fn() }
})
import { vgMusicBotRequest } from '../../../src/services/vgMusicBotClient'
import { fetchQueueState } from '../../../src/routes/music/vgMusicBotState'
import { setupStateRoutes } from '../../../src/routes/music/stateRoutes'
import { sseClients } from '../../../src/routes/music/helpers'
import { setupPlaybackRoutes } from '../../../src/routes/music/playbackRoutes'

const guildId = '123456789012345678'
const unavailable = {
    ok: false,
    status: 503,
    body: { error: 'No healthy USA Lavalink servers available' },
}
const api = jest.mocked(vgMusicBotRequest)

function app() {
    const instance = express()
    instance.use(express.json())
    setupStateRoutes(instance)
    setupPlaybackRoutes(instance)
    instance.use(
        (
            error: AppError,
            _req: unknown,
            res: express.Response,
            _next: unknown,
        ) => res.status(error.statusCode ?? 500).json({ error: error.message }),
    )
    return instance
}

describe('dashboard music availability', () => {
    beforeEach(() => api.mockReset())
    test('only a known missing-player response becomes an empty queue', async () => {
        api.mockResolvedValueOnce({
            ok: false,
            status: 400,
            body: { error: 'Current player not found!' },
        })
        expect(await fetchQueueState(guildId)).toBeNull()
        api.mockResolvedValueOnce({ ok: false, status: 404, body: null })
        await expect(fetchQueueState(guildId)).rejects.toMatchObject({
            statusCode: 404,
        })
    })
    test('rejects a malformed successful state instead of crashing during mapping', async () => {
        api.mockResolvedValueOnce({ ok: true, status: 200, body: {} })
        await expect(fetchQueueState(guildId)).rejects.toMatchObject({
            statusCode: 502,
        })
    })
    test('REST state returns the actual availability error', async () => {
        api.mockResolvedValue(unavailable)
        const res = await request(app()).get(
            `/api/guilds/${guildId}/music/state`,
        )
        expect(res.status).toBe(503)
        expect(res.body.error).toBe(unavailable.body.error)
    })
    test('failed player creation stops before a track PATCH and preserves its reason', async () => {
        api.mockResolvedValue(unavailable)
        const res = await request(app())
            .post(`/api/guilds/${guildId}/music/play`)
            .send({ query: 'a song' })
        expect(res.status).toBe(503)
        expect(res.body.error).toBe(unavailable.body.error)
        expect(api).toHaveBeenCalledTimes(1)
    })
    test('an existing player still accepts a play command', async () => {
        api.mockResolvedValueOnce({
            ok: false,
            status: 400,
            body: { error: 'Player existed in this guild' },
        }).mockResolvedValueOnce({ ok: true, status: 200, body: {} })
        const res = await request(app())
            .post(`/api/guilds/${guildId}/music/play`)
            .send({ query: 'a song' })
        expect(res.body.success).toBe(true)
        expect(api).toHaveBeenCalledTimes(2)
    })
    test('SSE publishes unavailable then recovers to empty state and cleans up', async () => {
        jest.useFakeTimers()
        const routes = new Map<string, (...args: any[]) => Promise<void>>()
        setupStateRoutes({
            get: (path: string, ...handlers: any[]) =>
                routes.set(path, handlers.at(-1)),
        } as any)
        const req = Object.assign(new EventEmitter(), { params: { guildId } })
        const res = Object.assign(new EventEmitter(), {
            writeHead: jest.fn(),
            write: jest.fn(),
        })
        try {
            api.mockResolvedValueOnce(unavailable)
            await routes.get('/api/guilds/:guildId/music/stream')!(req, res)
            expect(res.write).toHaveBeenLastCalledWith(
                expect.stringContaining('"type":"music_unavailable"'),
            )
            api.mockResolvedValue({
                ok: false,
                status: 400,
                body: { error: 'Current player not found!' },
            })
            await jest.advanceTimersByTimeAsync(2000)
            expect(res.write).toHaveBeenLastCalledWith(
                expect.stringContaining('"currentTrack":null'),
            )
        } finally {
            res.emit('close')
            expect(jest.getTimerCount()).toBe(0)
            jest.useRealTimers()
        }
    })
})

test('a completed HTTP request keeps streaming until its response disconnects', async () => {
    api.mockReset()
    api.mockResolvedValue({
        ok: false,
        status: 400,
        body: { error: 'Current player not found!' },
    })
    const instance = express()
    let closeResponse!: () => void
    const responseClosed = new Promise<void>((resolve) => {
        closeResponse = resolve
    })
    instance.use((req, res, next) => {
        res.on('close', closeResponse)
        // Serverless adapters may consume the request before Express handles it.
        req.resume()
        req.on('end', next)
    })
    setupStateRoutes(instance)
    const server = instance.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    let client: http.ClientRequest | undefined
    try {
        const address = server.address() as { port: number }
        const data = await new Promise<string>((resolve, reject) => {
            client = http.get(
                {
                    hostname: '127.0.0.1',
                    port: address.port,
                    path: `/api/guilds/${guildId}/music/stream`,
                },
                (response) => {
                    response.once('data', (chunk) => resolve(String(chunk)))
                    response.on('error', reject)
                },
            )
            client.on('error', reject)
            client.setTimeout(1000, () => {
                client?.destroy()
                reject(new Error('SSE did not deliver an initial state'))
            })
        })
        expect(data).toContain('"currentTrack":null')
        expect(sseClients.get(guildId)?.size).toBe(1)
        client?.destroy()
        await responseClosed
        expect(sseClients.has(guildId)).toBe(false)
    } finally {
        client?.destroy()
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
    }
})
