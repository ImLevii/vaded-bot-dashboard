import type { RainlinkQueueAdapter as GuildQueue } from '../../../../utils/music/rainlinkAdapter'
import { RainlinkLoopMode } from 'rainlink'
import { getTrackInfo } from '../../../../utils/music/trackUtils'
import { formatDurationClock } from '../../../../utils/general/formatDuration'
import type { QueueStats } from './types'

/**
 * Calculate queue statistics
 */
export async function calculateQueueStats(
    queue: GuildQueue,
): Promise<QueueStats> {
    const tracks = queue.tracks.toArray()
    const totalTracks = tracks.length

    // Calculate total duration
    let totalDurationMs = 0
    for (const track of tracks) {
        const trackInfo = await getTrackInfo(track)
        if (trackInfo.duration) {
            // Convert duration string to milliseconds if needed
            const durationMs = parseDurationToMs(trackInfo.duration)
            if (durationMs !== null && durationMs > 0) {
                totalDurationMs += durationMs
            }
        }
    }

    const totalDuration = formatDurationClock(
        Math.floor(totalDurationMs / 1000),
    )

    return {
        totalTracks,
        totalDuration,
        currentPosition: queue.node.streamTime ?? 0,
        isLooping: queue.repeatMode === RainlinkLoopMode.SONG,
        isShuffled: false,
        // Autoplay is deferred — no rainlink loop mode for it. See
        // decisions/2026-06-10-defer-autoplay-engine-extraction.md.
        autoplayEnabled: false,
    }
}

/**
 * Parse duration string to milliseconds
 */
function parseDurationToMs(duration: string): number | null {
    const parts = duration.split(':')
    if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10)
        const seconds = parseInt(parts[1], 10)
        return (minutes * 60 + seconds) * 1000
    }
    return null
}

/**
 * Get queue status information
 */
export function getQueueStatus(queue: GuildQueue): string {
    const status = []

    if (queue.repeatMode === RainlinkLoopMode.SONG) status.push('🔁 Loop')
    if (queue.repeatMode === RainlinkLoopMode.QUEUE)
        status.push('🔁 Loop Queue')
    if (queue.node.isPaused()) status.push('⏸️ Paused')

    return status.length > 0 ? status.join(' • ') : '▶️ Playing'
}
