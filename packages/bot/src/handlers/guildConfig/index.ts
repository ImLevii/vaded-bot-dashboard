import {
    autoModService,
    guildConfigControlService,
    type GuildConfigRefresh,
    type GuildConfigScope,
} from '@lucky/shared/services'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'
import type { CustomClient } from '../../types'
import { syncGuildCustomCommands } from '../customCommands/registration'

/**
 * Reacts to "this guild's config changed" signals published by the backend
 * when someone saves from the web dashboard.
 *
 * Each scope is responsible for undoing whatever makes the bot hold a stale
 * view of that config — usually a per-process cache. Handlers must be
 * idempotent: a signal can arrive more than once, and the bot may receive one
 * for a guild it is not in.
 */
type RefreshHandler = (
    client: CustomClient,
    guildId: string,
) => Promise<void> | void

const handlers: Record<GuildConfigScope, RefreshHandler> = {
    // AutoModService caches settings in a module-level Map for 300s. The
    // backend clearing its own copy on write does nothing for this process,
    // which is why dashboard changes appeared not to apply.
    automod: (_client, guildId) => {
        autoModService.invalidateSettingsCache(guildId)
        debugLog({
            message: `guildConfig: invalidated automod cache for ${guildId}`,
        })
    },

    // Re-register the guild's slash commands so a command created in the
    // dashboard is usable in Discord immediately. Guild-scoped registrations
    // propagate instantly, unlike global ones.
    customCommands: async (client, guildId) => {
        await syncGuildCustomCommands(client, guildId)
    },

    // LevelService performs no caching — config is read live on every message.
    levels: () => {},
}

export async function setupGuildConfigRefresh(
    client: CustomClient,
): Promise<void> {
    await guildConfigControlService.connect()
    if (!guildConfigControlService.isHealthy()) {
        infoLog({
            message:
                'guildConfig: Redis unavailable — dashboard config changes will apply on cache expiry or restart',
        })
        return
    }

    await guildConfigControlService.subscribeToRefresh(
        async ({ scope, guildId }: GuildConfigRefresh) => {
            const handler = handlers[scope]
            if (!handler) return
            try {
                await handler(client, guildId)
            } catch (error) {
                errorLog({
                    message: `guildConfig: ${scope} refresh failed for ${guildId}`,
                    error,
                })
            }
        },
    )
}

export async function teardownGuildConfigRefresh(): Promise<void> {
    await guildConfigControlService.disconnect()
}
