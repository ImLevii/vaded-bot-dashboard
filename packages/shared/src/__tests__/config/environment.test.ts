import {
    describe,
    expect,
    it,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'

// Mock dotenv so loadEnvironmentFiles() cannot re-populate process.env from
// the repo's real .env — without this, deleting a required var in a test is
// undone by the loader and the missing-vars branch never executes (#1262).
const mockDotenvConfig = jest.fn((..._args: unknown[]) => ({ parsed: {} }))
jest.mock('dotenv', () => ({
    config: (...args: unknown[]) => mockDotenvConfig(...args),
}))

// Mock fs.existsSync so findProjectRoot()/loadEnvironmentFiles() don't
// depend on the real repo's .env/.env.local presence — node's fs module
// exports aren't configurable, so jest.spyOn(fs, 'existsSync') can't
// redefine it; replacing the module is the reliable path.
const mockExistsSync = jest.fn((..._args: unknown[]) => false)
jest.mock('fs', () => ({
    ...(jest.requireActual('fs') as object),
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
}))

import {
    validateBackendEnvironment,
    ensureEnvironment,
} from '../../config/environment'

// These tests verify the cubic findings applied to environment.ts:
// P2 #1: isMissingVariable treats whitespace-only strings as missing
// P2 #2: ensureEnvironment calls assertions before marking loaded
// P3 #3: shared helper for assertion logic

describe('environment.ts - cubic findings verification', () => {
    const originalEnv = process.env

    beforeEach(() => {
        // Minimal fixture env, never a copy of the real one: keeps the
        // missing-vars branch deterministic regardless of ambient env, and
        // guarantees a failing assertion can only ever print fixture values,
        // not real secrets (#1262).
        process.env = { NODE_ENV: 'test' } as NodeJS.ProcessEnv
    })

    afterEach(() => {
        process.env = originalEnv
    })

    describe('P2 #1: whitespace-only env values treated as missing', () => {
        it('should reject whitespace-only REDIS_HOST in validateBackendEnvironment', () => {
            process.env.REDIS_HOST = '   '
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow(
                'Missing required backend environment variables: REDIS_HOST',
            )
        })

        it('should reject tab-only REDIS_HOST', () => {
            process.env.REDIS_HOST = '\t\t'
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow(/REDIS_HOST/)
        })

        it('should reject newline-only REDIS_HOST', () => {
            process.env.REDIS_HOST = '\n'
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow(/REDIS_HOST/)
        })

        it('should accept non-whitespace values', () => {
            process.env.REDIS_HOST = 'localhost'
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).not.toThrow()
        })

        it('should accept values with whitespace around valid content', () => {
            process.env.REDIS_HOST = '  localhost  '
            process.env.SPOTIFY_CLIENT_ID = '\tid\t'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).not.toThrow()
        })
    })

    describe('P2 #2: assertion runs before marking environment loaded', () => {
        it('should throw when ensureEnvironment finds missing required vars', async () => {
            process.env.DISCORD_TOKEN = 'token'
            process.env.CLIENT_ID = 'id'
            delete process.env.DATABASE_URL

            await expect(ensureEnvironment()).rejects.toThrow(
                'Missing required environment variables: DATABASE_URL',
            )
        })

        it('should throw when ensureEnvironment finds whitespace-only required vars', async () => {
            process.env.DISCORD_TOKEN = '   '
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            await expect(ensureEnvironment()).rejects.toThrow(
                'Missing required environment variables: DISCORD_TOKEN',
            )
        })

        it('should list all missing required variables in error', async () => {
            delete process.env.DISCORD_TOKEN
            delete process.env.CLIENT_ID
            delete process.env.DATABASE_URL

            const error = await ensureEnvironment().catch((e: any) => e)
            expect(error).toBeInstanceOf(Error)
            expect(error.message).toContain('DISCORD_TOKEN')
            expect(error.message).toContain('CLIENT_ID')
            expect(error.message).toContain('DATABASE_URL')
        })

        it('should not throw when all required environment variables are present', async () => {
            process.env.DISCORD_TOKEN = 'token'
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            await expect(ensureEnvironment()).resolves.toBeDefined()
        })
    })

    describe('P3 #3: shared helper for assertion logic', () => {
        it('should use consistent error message format for required vars', async () => {
            process.env.DISCORD_TOKEN = undefined
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            await expect(ensureEnvironment()).rejects.toThrow(
                'Missing required environment variables',
            )
        })

        it('should use consistent error message format for backend vars', () => {
            process.env.REDIS_HOST = undefined
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow('Missing required backend environment variables')
        })

        it('should include variable names in both assertion types', () => {
            delete process.env.DISCORD_TOKEN
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            delete process.env.REDIS_HOST
            process.env.SPOTIFY_CLIENT_ID = 'id'
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow('REDIS_HOST')
        })

        it('should handle multiple missing backend variables', () => {
            delete process.env.REDIS_HOST
            delete process.env.SPOTIFY_CLIENT_ID
            process.env.SPOTIFY_CLIENT_SECRET = 'secret'
            process.env.WEBAPP_SESSION_SECRET = 'secret'

            expect(() => {
                validateBackendEnvironment()
            }).toThrow(/REDIS_HOST/)
            expect(() => {
                validateBackendEnvironment()
            }).toThrow(/SPOTIFY_CLIENT_ID/)
        })
    })

    // Regression: loadEnvironmentFiles() used to pick whichever of
    // .env/.env.local it found first and stop there, so a .env.local
    // holding only an unrelated var silently prevented .env (and everything
    // in it, e.g. DATABASE_URL) from ever loading — reproduced via
    // `npm run dev:bot`, which has no separate pre-loader unlike start.mjs.
    describe('.env + .env.local layering', () => {
        beforeEach(() => {
            mockDotenvConfig.mockClear()
            mockExistsSync.mockReset()
            mockExistsSync.mockImplementation((target: unknown) => {
                const p = String(target)
                if (p.endsWith('.env.local')) return true
                if (p.endsWith('.env')) return true
                if (p.endsWith('package.json')) return true
                return false
            })
        })

        afterEach(() => {
            mockExistsSync.mockReset()
            mockExistsSync.mockImplementation(() => false)
        })

        it('loads both .env and .env.local in development mode, with .env.local overriding', async () => {
            process.env.NODE_ENV = 'development'
            process.env.DISCORD_TOKEN = 'token'
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            await ensureEnvironment()

            const paths = mockDotenvConfig.mock.calls.map(
                (call) => (call[0] as { path?: string }).path,
            )
            expect(paths.some((p) => p?.endsWith('.env.local'))).toBe(true)
            expect(
                paths.some(
                    (p) => p?.endsWith('.env') && !p?.endsWith('.env.local'),
                ),
            ).toBe(true)

            const localCall = mockDotenvConfig.mock.calls.find((call) =>
                (call[0] as { path?: string }).path?.endsWith('.env.local'),
            )
            expect((localCall?.[0] as { override?: boolean })?.override).toBe(
                true,
            )
        })

        it('loads only .env in production mode, ignoring .env.local', async () => {
            process.env.NODE_ENV = 'production'
            process.env.DISCORD_TOKEN = 'token'
            process.env.CLIENT_ID = 'id'
            process.env.DATABASE_URL = 'url'

            await ensureEnvironment()

            const paths = mockDotenvConfig.mock.calls.map(
                (call) => (call[0] as { path?: string }).path,
            )
            expect(paths.some((p) => p?.endsWith('.env.local'))).toBe(false)
            expect(
                paths.some(
                    (p) => p?.endsWith('.env') && !p?.endsWith('.env.local'),
                ),
            ).toBe(true)
        })
    })
})
