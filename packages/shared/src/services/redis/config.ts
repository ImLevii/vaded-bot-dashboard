/**
 * Redis configuration setup
 */

import { parseIntEnv } from '../../utils/env'
import type { RedisConfig } from './types'

export function createRedisConfig(): RedisConfig {
    return {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseIntEnv('REDIS_PORT', 6379),
        password: process.env.REDIS_PASSWORD,
        db: parseIntEnv('REDIS_DB', 0),
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
    }
}
