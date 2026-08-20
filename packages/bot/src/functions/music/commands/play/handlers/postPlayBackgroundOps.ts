import type {
    RainlinkQueueAdapter as GuildQueue,
    RainlinkTrackAdapter as Track,
} from '../../../../../utils/music/rainlinkAdapter'
import { errorLog } from '@lucky/shared/utils'
import { addBreadcrumb } from '@lucky/shared/utils/monitoring'
import { applyStoredAutoplayPreference } from './autoplayPreference'
import { clearAutoplayPause } from '../../../../../utils/music/autoplay/skipCircuitBreaker'
import { clearSessionMoodCache } from '../../../../../utils/music/autoplay/replenisher'

export interface PostPlayBackgroundOpsInput {
    queue: GuildQueue | null | undefined
    guildId: string
    track: Track
    hadQueueBeforePlay: boolean
    isPlaylist: boolean
}

const AUTOPLAY_PREFERENCE_RETRY_DELAY_MS = 150

/**
 * Runs one post-play background op in isolation. A failure is recorded (telemetry
 * breadcrumb + error log) but NEVER cascades to the other ops — fixing #1085, where
 * a single shared try/catch meant a `clearAutoplayPause` or preference-load failure
 * silently skipped the remaining work.
 */
async function runIsolated(
    op: string,
    guildId: string,
    fn: () => void | Promise<void>,
): Promise<void> {
    try {
        await fn()
    } catch (error) {
        try {
            addBreadcrumb('post_play_bg_op_failed', 'play', 'warning', {
                op,
                guildId,
            })
        } catch {
            // Observability must never break the handler.
        }
        errorLog({
            message: `Post-play background op failed: ${op}`,
            error,
            data: { guildId, op },
        })
    }
}

/**
 * Retries a transient op once (2 attempts total) with a short backoff. Used for the
 * stored-autoplay-preference read, which can fail transiently on a slow DB. The final
 * failure (if any) is surfaced to the caller's `runIsolated`.
 */
async function withSingleRetry(fn: () => Promise<void>): Promise<void> {
    try {
        await fn()
    } catch {
        await new Promise((resolve) =>
            setTimeout(resolve, AUTOPLAY_PREFERENCE_RETRY_DELAY_MS),
        )
        await fn()
    }
}

/**
 * Post-play background work, dispatched fire-and-forget by the play handler. Each op
 * is isolated so one failure never silently skips the others.
 */
export async function runPostPlayBackgroundOps(
    input: PostPlayBackgroundOpsInput,
): Promise<void> {
    // Autoplay (preference application, cross-fade blending) is deferred —
    // rainlink has no AUTOPLAY loop mode. See
    // decisions/2026-06-10-defer-autoplay-engine-extraction.md.
    const { queue, guildId, hadQueueBeforePlay } = input

    await runIsolated('clearAutoplayPause', guildId, () =>
        clearAutoplayPause(guildId),
    )

    await runIsolated('clearSessionMoodCache', guildId, () =>
        clearSessionMoodCache(guildId),
    )

    if (!hadQueueBeforePlay && queue) {
        await runIsolated('applyStoredAutoplayPreference', guildId, () =>
            withSingleRetry(() =>
                applyStoredAutoplayPreference(queue, guildId),
            ),
        )
    }
}
