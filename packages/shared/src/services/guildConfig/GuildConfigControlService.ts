import RedisClientClass, { type Redis } from 'ioredis'
import { createRedisConfig } from '../redis/config.js'
import { debugLog, errorLog, infoLog } from '../../utils/general/log.js'
import { captureMessageThrottled } from '../../utils/monitoring/sentry.js'

/** Redis pub/sub channel carrying "re-read this guild's config" signals. */
export const CHANNEL_GUILD_CONFIG_REFRESH = 'guildconfig:refresh'

/** Which subsystem's configuration changed. */
export type GuildConfigScope = 'automod' | 'customCommands' | 'levels'

export type GuildConfigRefresh = {
    scope: GuildConfigScope
    guildId: string
}

const VALID_SCOPES: readonly GuildConfigScope[] = [
    'automod',
    'customCommands',
    'levels',
]

function parseRefresh(raw: string): GuildConfigRefresh | null {
    try {
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return null
        const { scope, guildId } = parsed as Record<string, unknown>
        if (typeof guildId !== 'string' || guildId.length === 0) return null
        if (!VALID_SCOPES.includes(scope as GuildConfigScope)) return null
        return { scope: scope as GuildConfigScope, guildId }
    } catch {
        return null
    }
}

/**
 * Lightweight Redis pub/sub bridge that lets the backend tell the running bot
 * that a guild's configuration changed.
 *
 * The bot and the backend are separate processes (see ecosystem.config.cjs),
 * so a dashboard write lands in Postgres and is invisible to the bot until it
 * restarts — or, worse, until a per-process in-memory cache expires. That is
 * the AutoMod symptom: `AutoModService` caches settings for 300s in a
 * module-level Map, and the backend clearing *its own* copy does nothing for
 * the bot's.
 *
 * Mirrors {@link TwitchControlService}, which solved the identical problem for
 * Twitch subscriptions (#870). Unlike that one, the payload carries a scope
 * and a guildId so a single channel serves several subsystems and listeners
 * only do work for the guild that actually changed.
 */
export class GuildConfigControlService {
    private publisher: Redis | null = null
    private subscriber: Redis | null = null

    async connect(): Promise<void> {
        try {
            const config = createRedisConfig()
            this.publisher = new RedisClientClass(config) as Redis
            this.subscriber = new RedisClientClass(config) as Redis
            // Without these, ioredis logs unhandled 'error' events as raw
            // console dumps instead of through the app logger.
            this.publisher.on('error', (error) =>
                errorLog({
                    message: 'GuildConfigControlService publisher error:',
                    error,
                }),
            )
            this.subscriber.on('error', (error) =>
                errorLog({
                    message: 'GuildConfigControlService subscriber error:',
                    error,
                }),
            )
            await Promise.all([
                this.publisher.connect(),
                this.subscriber.connect(),
            ])
            infoLog({ message: 'GuildConfigControlService connected to Redis' })
        } catch (error) {
            errorLog({
                message: 'GuildConfigControlService failed to connect:',
                error,
            })
        }
    }

    async disconnect(): Promise<void> {
        try {
            if (this.subscriber) {
                await this.subscriber.unsubscribe()
                await this.subscriber.disconnect()
            }
            if (this.publisher) await this.publisher.disconnect()
            debugLog({ message: 'GuildConfigControlService disconnected' })
        } catch (error) {
            errorLog({
                message: 'GuildConfigControlService disconnect error:',
                error,
            })
        }
    }

    /**
     * True when both pub/sub connections are established and ready. False
     * before connect(), after a failed connect, or while ioredis is
     * reconnecting after Redis went away.
     */
    isHealthy(): boolean {
        return (
            this.publisher?.status === 'ready' &&
            this.subscriber?.status === 'ready'
        )
    }

    /**
     * Tell every listening bot that `scope` changed for `guildId`.
     *
     * Gated on the *publisher* connection only — not {@link isHealthy} — so a
     * subscriber reconnect on this process can't suppress an otherwise-valid
     * publish.
     *
     * Fire-and-forget: if Redis is unavailable the dashboard write still
     * landed in Postgres and the bot picks it up on its next restart (or cache
     * expiry), so a skipped/failed publish is logged but never surfaced to the
     * caller. A config save must not fail because Redis is down.
     */
    async publishRefresh(
        scope: GuildConfigScope,
        guildId: string,
    ): Promise<void> {
        if (this.publisher?.status !== 'ready') {
            debugLog({
                message: `GuildConfigControlService: skipping ${scope} refresh publish (Redis not ready)`,
            })
            captureMessageThrottled(
                `guildconfig:${scope}:skip`,
                `GuildConfigControlService: ${scope} refresh publish skipped — Redis not ready; bot sync delayed until reconnect/restart`,
                'warning',
            )
            return
        }
        try {
            await this.publisher.publish(
                CHANNEL_GUILD_CONFIG_REFRESH,
                JSON.stringify({ scope, guildId } satisfies GuildConfigRefresh),
            )
        } catch (error) {
            errorLog({
                message: 'GuildConfigControlService: refresh publish failed',
                error,
            })
            captureMessageThrottled(
                `guildconfig:${scope}:fail`,
                'GuildConfigControlService: refresh publish failed',
                'warning',
                {
                    reason:
                        error instanceof Error ? error.message : String(error),
                },
            )
        }
    }

    /**
     * Run `handler` whenever a refresh signal arrives. Malformed payloads are
     * dropped, and handler errors are logged and swallowed so one bad refresh
     * can't tear down the subscriber.
     */
    async subscribeToRefresh(
        handler: (refresh: GuildConfigRefresh) => Promise<void>,
    ): Promise<void> {
        if (!this.subscriber) return
        await this.subscriber.subscribe(CHANNEL_GUILD_CONFIG_REFRESH)
        this.subscriber.on('message', async (ch: string, raw: string) => {
            if (ch !== CHANNEL_GUILD_CONFIG_REFRESH) return
            const refresh = parseRefresh(raw)
            if (!refresh) {
                debugLog({
                    message: `GuildConfigControlService: ignoring malformed refresh payload: ${raw}`,
                })
                return
            }
            try {
                await handler(refresh)
            } catch (error) {
                errorLog({
                    message: `GuildConfigControlService: ${refresh.scope} refresh handler failed`,
                    error,
                })
            }
        })
        infoLog({ message: 'Subscribed to guild config refresh signals' })
    }
}

export const guildConfigControlService = new GuildConfigControlService()
