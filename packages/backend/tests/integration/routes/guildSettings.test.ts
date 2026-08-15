import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupGuildSettingsRoutes } from '../../../src/routes/guildSettings'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockGetSettings = jest.fn<any>()
const mockSetSettings = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: any[]) => mockGetSettings(...args),
        setGuildSettings: (...args: any[]) => mockSetSettings(...args),
    },
}))

const mockFindUniqueGuildSettings = jest.fn<any>()
const mockUpsertGuildSettings = jest.fn<any>()

// tests/setup.ts globally mocks '@lucky/shared/utils' with a log-only stub
// (no getPrismaClient), which this suite needs. Re-declaring it here with
// jest.mock (rather than jest.requireActual + spread, which re-evaluates the
// real log module and its chalk import in a way that breaks setupSessionMiddleware's
// debugLog call) overrides that stub for this file only, keeping the same
// no-op log functions plus a mocked getPrismaClient.
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    captureException: jest.fn(),
    getPrismaClient: jest.fn(() => ({
        guildSettings: {
            findUnique: (...args: any[]) =>
                mockFindUniqueGuildSettings(...args),
            upsert: (...args: any[]) => mockUpsertGuildSettings(...args),
        },
    })),
}))

describe('Guild Settings Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupGuildSettingsRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    const GUILD_ID = '111111111111111111'

    describe('GET /api/guilds/:guildId/settings', () => {
        test('should return settings when authenticated', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const settings = {
                nickname: 'TestBot',
                commandPrefix: '!',
                managerRoles: [],
                updatesChannel: '',
                timezone: 'UTC',
                disableWarnings: false,
            }
            mockFindUniqueGuildSettings.mockResolvedValue(settings)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.settings).toEqual(settings)
            expect(mockFindUniqueGuildSettings).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID },
                select: {
                    nickname: true,
                    commandPrefix: true,
                    managerRoles: true,
                    updatesChannel: true,
                    timezone: true,
                    disableWarnings: true,
                },
            })
        })

        test('should return defaults when no settings row exists', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockFindUniqueGuildSettings.mockResolvedValue(null)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.settings).toEqual({
                nickname: '',
                commandPrefix: '!',
                managerRoles: [],
                updatesChannel: '',
                timezone: 'UTC',
                disableWarnings: false,
            })
        })

        test('should return 401 when not authenticated', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(null)

            const res = await request(app).get(
                `/api/guilds/${GUILD_ID}/settings`,
            )

            expect(res.status).toBe(401)
        })
    })

    describe('POST /api/guilds/:guildId/settings', () => {
        test('should update settings', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockUpsertGuildSettings.mockResolvedValue({})

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ nickname: 'NewName', commandPrefix: '!' })

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(mockUpsertGuildSettings).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID },
                create: {
                    guildId: GUILD_ID,
                    nickname: 'NewName',
                    commandPrefix: '!',
                },
                update: { nickname: 'NewName', commandPrefix: '!' },
            })
        })

        test('should persist settings so a later GET reflects the save (round-trip)', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockUpsertGuildSettings.mockResolvedValue({})

            const payload = {
                nickname: 'Round Trip Bot',
                commandPrefix: '?',
                managerRoles: ['role-1'],
                updatesChannel: 'chan-1',
                timezone: 'America/New_York',
                disableWarnings: true,
            }

            const postRes = await request(app)
                .post(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send(payload)
            expect(postRes.status).toBe(200)

            // Simulate the row the upsert would have written, as the next GET would see it.
            mockFindUniqueGuildSettings.mockResolvedValue(payload)

            const getRes = await request(app)
                .get(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(getRes.status).toBe(200)
            expect(getRes.body.settings).toEqual(payload)
        })

        test('should reject invalid fields', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ invalidField: 'value' })

            expect(res.status).toBe(400)
        })
    })

    describe('GET /api/guilds/:guildId/modules/:slug/settings', () => {
        test('should return module settings', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const settings = { defaultVolume: 50, autoPlayEnabled: true }
            mockGetSettings.mockResolvedValue(settings)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/modules/music/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.settings).toEqual(settings)
        })
    })

    describe('POST /api/guilds/:guildId/modules/:slug/settings', () => {
        test('should update module settings', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockSetSettings.mockResolvedValue(true)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/modules/music/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ defaultVolume: 75 })

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
        })
    })
})
