/**
 * Redis configuration setup
 */

import { parseIntEnv } from '../../utils/env'
import type { RedisConfig } from './types'

// Managed Redis providers (Redis Cloud, Upstash, etc.) typically hand out a
// single connection URL rather than discrete host/port/password — support
// both instead of requiring the caller to split it up manually.
function parseRedisUrl(
    url: string,
): Pick<RedisConfig, 'host' | 'port' | 'password' | 'db' | 'tls'> {
    const parsed = new URL(url)
    const dbPath = parsed.pathname.replace(/^\//, '')

    return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 6379,
        password: parsed.password || undefined,
        db: dbPath ? Number(dbPath) : 0,
        tls: parsed.protocol === 'rediss:' ? {} : undefined,
    }
}

export function createRedisConfig(): RedisConfig {
    const redisUrl = process.env.REDIS_URL?.trim()
    const fromUrl = redisUrl ? parseRedisUrl(redisUrl) : undefined

    return {
        host: fromUrl?.host ?? process.env.REDIS_HOST ?? 'localhost',
        port: fromUrl?.port ?? parseIntEnv('REDIS_PORT', 6379),
        password: fromUrl?.password ?? process.env.REDIS_PASSWORD,
        db: fromUrl?.db ?? parseIntEnv('REDIS_DB', 0),
        tls: fromUrl?.tls,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
    }
}
