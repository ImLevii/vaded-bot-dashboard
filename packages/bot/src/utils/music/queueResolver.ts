import type { Rainlink } from 'rainlink'
import { debugLog } from '@lucky/shared/utils'
import { addBreadcrumb } from '@lucky/shared/utils/monitoring'
import type { CustomClient } from '../../types'
import { wrapPlayer, type RainlinkQueueAdapter } from './rainlinkAdapter'

export type QueueResolutionSource = 'players.get' | 'miss'

export type QueueResolutionDiagnostics = {
    guildId: string
    cacheSize: number
    cacheSampleKeys: string[]
}

export type QueueResolutionResult = {
    queue: RainlinkQueueAdapter | null
    source: QueueResolutionSource
    diagnostics: QueueResolutionDiagnostics
}

/**
 * Resolves the RainlinkPlayer for a guild, wrapped in the GuildQueue-shaped
 * adapter (see rainlinkAdapter.ts) so existing callers — 50+ command/handler
 * files written against discord-player's `GuildQueue` — keep working
 * unchanged. Kept as `resolveGuildQueue` (not renamed) specifically to avoid
 * touching every one of those import sites for a naming-only change.
 *
 * rainlink's player store (`Rainlink#players`) is a flat Map-like lookup by
 * guildId, unlike discord-player's several inconsistent lookup paths
 * (nodes.get/queues.get/nodes.resolve/cache scans) the old version of this
 * file had to try in sequence — so this collapses to one lookup.
 */
export function resolveGuildQueue(
    client: Pick<CustomClient, 'player'>,
    guildId: string,
): QueueResolutionResult {
    const rainlink = client.player as unknown as Rainlink
    const players = rainlink?.players
    const cacheSize = players?.size ?? 0
    const diagnostics: QueueResolutionDiagnostics = {
        guildId,
        cacheSize,
        cacheSampleKeys: players?.full?.slice(0, 5).map(([key]) => key) ?? [],
    }

    const rainlinkPlayer = players?.get?.(guildId)
    if (rainlinkPlayer) {
        debugLog({
            message: 'Resolved guild queue',
            data: { guildId, source: 'players.get' },
        })
        emitTelemetry('players.get', cacheSize)
        return {
            queue: wrapPlayer(rainlinkPlayer),
            source: 'players.get',
            diagnostics,
        }
    }

    emitTelemetry('miss', cacheSize)
    return { queue: null, source: 'miss', diagnostics }
}

function emitTelemetry(source: QueueResolutionSource, cacheSize: number): void {
    try {
        addBreadcrumb('queue_resolution_source', 'queue_resolution', 'info', {
            source,
            cacheSize,
        })
    } catch {
        // Telemetry failures must never break queue resolution
    }
}
