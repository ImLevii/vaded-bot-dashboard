import type { Request } from 'express'
import { beforeEach, afterEach, describe, expect, test } from '@jest/globals'
import {
    getOAuthRedirectUri,
    getFrontendRedirectOrigin,
} from '../../../src/utils/oauthRedirectUri'

function createRequest(
    headers: Record<string, string> = {},
    protocol = 'http',
    host = 'localhost:3000',
): Request {
    return {
        headers,
        protocol,
        get: (name: string) =>
            name.toLowerCase() === 'host' ? host : undefined,
    } as unknown as Request
}

describe('getOAuthRedirectUri', () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalRedirectUri = process.env.WEBAPP_REDIRECT_URI
    const originalBackendUrl = process.env.WEBAPP_BACKEND_URL
    const originalFrontendUrl = process.env.WEBAPP_FRONTEND_URL
    const originalPort = process.env.WEBAPP_PORT
    const originalForceRedirectUri = process.env.WEBAPP_REDIRECT_URI_FORCE

    beforeEach(() => {
        process.env.NODE_ENV = 'test'
        process.env.WEBAPP_REDIRECT_URI =
            'http://localhost:3000/api/auth/callback'
        delete process.env.WEBAPP_REDIRECT_URI_FORCE
        delete process.env.WEBAPP_BACKEND_URL
        process.env.WEBAPP_FRONTEND_URL = 'http://localhost:5173'
    })

    afterEach(() => {
        if (originalNodeEnv) {
            process.env.NODE_ENV = originalNodeEnv
        } else {
            delete process.env.NODE_ENV
        }

        if (originalRedirectUri) {
            process.env.WEBAPP_REDIRECT_URI = originalRedirectUri
        } else {
            delete process.env.WEBAPP_REDIRECT_URI
        }

        if (originalBackendUrl) {
            process.env.WEBAPP_BACKEND_URL = originalBackendUrl
        } else {
            delete process.env.WEBAPP_BACKEND_URL
        }

        if (originalFrontendUrl) {
            process.env.WEBAPP_FRONTEND_URL = originalFrontendUrl
        } else {
            delete process.env.WEBAPP_FRONTEND_URL
        }

        if (originalPort) {
            process.env.WEBAPP_PORT = originalPort
        } else {
            delete process.env.WEBAPP_PORT
        }

        if (originalForceRedirectUri) {
            process.env.WEBAPP_REDIRECT_URI_FORCE = originalForceRedirectUri
        } else {
            delete process.env.WEBAPP_REDIRECT_URI_FORCE
        }
    })

    test('should force configured redirect uri when WEBAPP_REDIRECT_URI_FORCE is true', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_REDIRECT_URI_FORCE = 'true'
        process.env.WEBAPP_REDIRECT_URI =
            'http://localhost:5173/api/auth/callback'

        const uri = getOAuthRedirectUri(
            createRequest({
                'x-forwarded-proto': 'https',
                'x-forwarded-host': 'vaded-bot-dashboard.vercel.app',
            }),
        )

        expect(uri).toBe('http://localhost:5173/api/auth/callback')
    })

    test('should prefer session redirect uri when available', () => {
        const uri = getOAuthRedirectUri(
            createRequest(),
            'https://api.example.com/api/auth/callback',
        )

        expect(uri).toBe('https://api.example.com/api/auth/callback')
    })

    test('should normalize legacy /auth/callback path', () => {
        const uri = getOAuthRedirectUri(
            createRequest(),
            'https://api.example.com/auth/callback',
        )

        expect(uri).toBe('https://api.example.com/api/auth/callback')
    })

    test('should derive callback from forwarded host in production when env is unset', () => {
        process.env.NODE_ENV = 'production'
        delete process.env.WEBAPP_REDIRECT_URI

        const uri = getOAuthRedirectUri(
            createRequest({
                'x-forwarded-proto': 'https',
                'x-forwarded-host': 'vaded.gg',
            }),
        )

        expect(uri).toBe('https://vaded.gg/api/auth/callback')
    })

    test('should normalize legacy /auth/callback from env', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_REDIRECT_URI = 'https://vaded.gg/auth/callback'

        const uri = getOAuthRedirectUri(createRequest())

        expect(uri).toBe('https://vaded.gg/api/auth/callback')
    })

    test('should keep configured callback when WEBAPP_BACKEND_URL is set', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_REDIRECT_URI = 'https://vaded.gg/api/auth/callback'
        process.env.WEBAPP_BACKEND_URL = 'https://api.vaded.gg'

        const uri = getOAuthRedirectUri(createRequest())

        expect(uri).toBe('https://vaded.gg/api/auth/callback')
    })

    test('should prefer forwarded host over configured callback in production', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_REDIRECT_URI = 'https://vaded.gg/api/auth/callback'
        process.env.WEBAPP_FRONTEND_URL = 'https://vaded.gg'

        const uri = getOAuthRedirectUri(
            createRequest({
                'x-forwarded-proto': 'https',
                'x-forwarded-host': 'vaded-bot-dashboard.vercel.app',
            }),
        )

        expect(uri).toBe(
            'https://vaded-bot-dashboard.vercel.app/api/auth/callback',
        )
    })

    test('should keep configured callback when frontend origins do not match redirect origin', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_REDIRECT_URI =
            'https://api.vaded.gg/api/auth/callback'
        process.env.WEBAPP_FRONTEND_URL = 'https://vaded.gg'

        const uri = getOAuthRedirectUri(createRequest())

        expect(uri).toBe('https://api.vaded.gg/api/auth/callback')
    })

    test('should use forwarded host in non-production when env is unset', () => {
        delete process.env.WEBAPP_REDIRECT_URI

        const uri = getOAuthRedirectUri(
            createRequest({
                'x-forwarded-proto': 'https',
                'x-forwarded-host': 'dashboard.example.com',
            }),
        )

        expect(uri).toBe('https://dashboard.example.com/api/auth/callback')
    })

    test('forces https in production regardless of forwarded proto', () => {
        process.env.NODE_ENV = 'production'
        delete process.env.WEBAPP_REDIRECT_URI

        const req = {
            headers: {
                'x-forwarded-proto': 'http',
                'x-forwarded-host': 'vaded.example.com',
            },
            protocol: 'http',
            get: () => undefined,
        } as unknown as Request

        expect(getOAuthRedirectUri(req)).toBe(
            'https://vaded.example.com/api/auth/callback',
        )
    })

    test('uses first element of an array-valued forwarded host', () => {
        process.env.NODE_ENV = 'production'
        delete process.env.WEBAPP_REDIRECT_URI

        const req = {
            headers: {
                'x-forwarded-proto': 'https',
                'x-forwarded-host': [
                    'proxy-a.example.com',
                    'proxy-b.example.com',
                ],
            },
            protocol: 'http',
            get: () => undefined,
        } as unknown as Request

        expect(getOAuthRedirectUri(req)).toBe(
            'https://proxy-a.example.com/api/auth/callback',
        )
    })

    test('uses first comma-separated forwarded host and trims it', () => {
        process.env.NODE_ENV = 'production'
        delete process.env.WEBAPP_REDIRECT_URI

        const req = {
            headers: {
                'x-forwarded-proto': 'https',
                'x-forwarded-host': ' edge.example.com , inner.example.com',
            },
            protocol: 'http',
            get: () => undefined,
        } as unknown as Request

        expect(getOAuthRedirectUri(req)).toBe(
            'https://edge.example.com/api/auth/callback',
        )
    })

    test('ignores a whitespace-only forwarded host header', () => {
        delete process.env.WEBAPP_REDIRECT_URI
        process.env.WEBAPP_PORT = '8080'

        const req = {
            headers: { 'x-forwarded-host': '   ' },
            protocol: 'http',
            get: () => undefined,
        } as unknown as Request

        expect(getOAuthRedirectUri(req)).toBe(
            'http://localhost:8080/api/auth/callback',
        )

        delete process.env.WEBAPP_PORT
    })

    test('falls back to req.protocol and req host in non-production', () => {
        delete process.env.WEBAPP_REDIRECT_URI

        const req = {
            headers: {},
            protocol: 'https',
            get: (name: string) =>
                name.toLowerCase() === 'host' ? 'app.local' : undefined,
        } as unknown as Request

        expect(getOAuthRedirectUri(req)).toBe(
            'https://app.local/api/auth/callback',
        )
    })

    test('falls back to localhost:WEBAPP_PORT when no forwarded or req host', () => {
        delete process.env.WEBAPP_REDIRECT_URI
        process.env.WEBAPP_PORT = '4567'

        const req = {
            headers: {},
            protocol: 'http',
            get: () => undefined,
        } as unknown as Request

        expect(getOAuthRedirectUri(req)).toBe(
            'http://localhost:4567/api/auth/callback',
        )

        delete process.env.WEBAPP_PORT
    })

    test('defaults to port 3000 when WEBAPP_PORT is unset', () => {
        delete process.env.WEBAPP_REDIRECT_URI
        delete process.env.WEBAPP_PORT

        const req = {
            headers: {},
            protocol: 'http',
            get: () => undefined,
        } as unknown as Request

        expect(getOAuthRedirectUri(req)).toBe(
            'http://localhost:3000/api/auth/callback',
        )
    })

    test('ignores a malformed session redirect uri and uses env', () => {
        const uri = getOAuthRedirectUri(createRequest(), 'not-a-valid-url')

        expect(uri).toBe('http://localhost:3000/api/auth/callback')
    })

    test('leaves a non-legacy session path unchanged', () => {
        const uri = getOAuthRedirectUri(
            createRequest(),
            'https://api.example.com/some/other/path',
        )

        expect(uri).toBe('https://api.example.com/some/other/path')
    })

    test('defaults protocol to http when neither forwarded nor req protocol set', () => {
        delete process.env.WEBAPP_REDIRECT_URI

        const req = {
            headers: {},
            protocol: undefined,
            get: (name: string) =>
                name.toLowerCase() === 'host' ? 'app.local' : undefined,
        } as unknown as Request

        expect(getOAuthRedirectUri(req)).toBe(
            'http://app.local/api/auth/callback',
        )
    })
})

describe('getFrontendRedirectOrigin', () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalFrontendUrl = process.env.WEBAPP_FRONTEND_URL

    afterEach(() => {
        if (originalNodeEnv) {
            process.env.NODE_ENV = originalNodeEnv
        } else {
            delete process.env.NODE_ENV
        }

        if (originalFrontendUrl) {
            process.env.WEBAPP_FRONTEND_URL = originalFrontendUrl
        } else {
            delete process.env.WEBAPP_FRONTEND_URL
        }
    })

    test('derives origin from forwarded host, ignoring a stale configured frontend url', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_FRONTEND_URL =
            'https://vaded-bot-dashboard.vercel.app'

        const req = createRequest({
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'vaded.gg',
        })

        expect(getFrontendRedirectOrigin(req)).toBe('https://vaded.gg')
    })

    test('follows the forwarded host even when it is the legacy vercel domain', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_FRONTEND_URL = 'https://vaded.gg'

        const req = createRequest({
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'vaded-bot-dashboard.vercel.app',
        })

        expect(getFrontendRedirectOrigin(req)).toBe(
            'https://vaded-bot-dashboard.vercel.app',
        )
    })

    test('falls back to the configured primary frontend url when no host is forwarded', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_FRONTEND_URL = 'https://vaded.gg'

        const req = createRequest()

        expect(getFrontendRedirectOrigin(req)).toBe('https://vaded.gg')
    })

    test('forces https in production regardless of forwarded proto', () => {
        process.env.NODE_ENV = 'production'

        const req = createRequest({
            'x-forwarded-proto': 'http',
            'x-forwarded-host': 'vaded.gg',
        })

        expect(getFrontendRedirectOrigin(req)).toBe('https://vaded.gg')
    })
})
