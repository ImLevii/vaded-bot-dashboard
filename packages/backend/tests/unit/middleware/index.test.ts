import { describe, test, expect } from '@jest/globals'
import express from 'express'
import { setupMiddleware } from '../../../src/middleware'

describe('Middleware setup', () => {
    test('should enable trust proxy in production', () => {
        const originalNodeEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'
        const app = express()

        setupMiddleware(app)

        expect(app.get('trust proxy')).toBe(1)
        process.env.NODE_ENV = originalNodeEnv
    })

    // Every real deployment path (Vercel, Cloudflare Tunnel, nginx) sits
    // behind a reverse proxy regardless of NODE_ENV — hosts intentionally
    // run with NODE_ENV=development for local-cookie behavior while still
    // being proxied, so gating trust proxy on NODE_ENV broke
    // express-rate-limit's IP resolution there.
    test('should enable trust proxy outside production too', () => {
        const originalNodeEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'test'
        const app = express()

        setupMiddleware(app)

        expect(app.get('trust proxy')).toBe(1)
        process.env.NODE_ENV = originalNodeEnv
    })
})
