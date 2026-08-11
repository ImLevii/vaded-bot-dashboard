import type { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { RedisStore, type RedisReply } from 'rate-limit-redis'
import { redisClient } from '@lucky/shared/services'
import { recordWithCooldown, emitAlert } from '@lucky/shared/utils/alerts'

// A default in-memory store only enforces limits per-instance, which is
// meaningless once the backend runs as multiple concurrent serverless
// invocations — a client spread across instances would never actually hit
// the limit. Back it with Redis so counts are shared; `passOnStoreError`
// lets requests through (falling back to no rate limiting for that request)
// if Redis is unreachable, rather than 500ing or blocking everyone.
function createRedisStore(prefix: string): RedisStore {
    return new RedisStore({
        prefix,
        sendCommand: (...args: string[]): Promise<RedisReply> => {
            const client = redisClient.getClient()
            if (!client) {
                return Promise.reject(new Error('Redis client unavailable'))
            }
            const [command, ...rest] = args
            return client.call(command, ...rest) as Promise<RedisReply>
        },
    })
}

export function maskIp(ip: string): string {
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — extract and mask as IPv4
    const v4Mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
    if (v4Mapped) {
        const parts = v4Mapped[1].split('.')
        return parts.slice(0, 3).join('.') + '.xxx'
    }
    if (ip.includes(':')) {
        // IPv6 — keep first 4 groups
        const parts = ip.split(':')
        return parts.slice(0, 4).join(':') + ':xxxx:xxxx:xxxx:xxxx'
    }
    // IPv4 — mask last octet
    const parts = ip.split('.')
    return parts.slice(0, 3).join('.') + '.xxx'
}

export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    store: createRedisStore('rl:api:'),
    passOnStoreError: true,
})

export function authRateLimitHandler(req: Request, res: Response): void {
    const ip = req.ip ?? 'unknown'
    const maskedIp = maskIp(ip)
    if (
        recordWithCooldown(`auth-limit:${ip}`, 60 * 60_000, 3, 4 * 60 * 60_000)
    ) {
        void emitAlert({
            title: '⚠️ Auth brute-force detected',
            description: `IP \`${maskedIp}\` has exhausted the auth rate limit 3+ times in 1 hour`,
            color: 'warning',
            fields: [{ name: 'IP', value: maskedIp }],
        })
    }
    res.status(429).json({
        error: 'Too many auth attempts, please try again later',
    })
}

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, please try again later' },
    handler: authRateLimitHandler,
    store: createRedisStore('rl:auth:'),
    passOnStoreError: true,
})

export const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many write requests, please try again later' },
    store: createRedisStore('rl:write:'),
    passOnStoreError: true,
})
