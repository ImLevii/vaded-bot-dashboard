import type {
    RainlinkTrackAdapter as Track,
    RainlinkQueueAdapter as GuildQueue,
} from './rainlinkAdapter'
import { errorLog } from '@lucky/shared/utils'

const HISTORY_SEED_LIMIT = 3
const QUEUE_RESCUE_PROBE_TIMEOUT_MS = Number.parseInt(
    process.env.QUEUE_RESCUE_PROBE_TIMEOUT_MS ?? '5000',
    10,
)

export type QueueRescueResult = {
    removedTracks: number
    keptTracks: number
    addedTracks: number
}

export type RescueQueueOptions = {
    probeResolvable?: boolean
    probeTimeoutMs?: number
    refillThreshold?: number
}

function isPlayableTrack(track: Track): boolean {
    return Boolean(track.url) && Boolean(track.title) && Boolean(track.author)
}

async function probeTrackResolvable(
    queue: GuildQueue,
    track: Track,
    timeoutMs: number,
): Promise<boolean> {
    const query = track.url || `${track.title} ${track.author}`.trim()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
        const result = await Promise.race([
            queue.search(query),
            new Promise<null>(
                (resolve) =>
                    (timeoutId = setTimeout(() => resolve(null), timeoutMs)),
            ),
        ])
        return result !== null && result.tracks.length > 0
    } catch {
        return false
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
    }
}

export async function rescueQueue(
    queue: GuildQueue,
    opts: RescueQueueOptions = {},
): Promise<QueueRescueResult> {
    const {
        probeResolvable = false,
        probeTimeoutMs = QUEUE_RESCUE_PROBE_TIMEOUT_MS,
    } = opts

    try {
        const tracks = queue.tracks.toArray()
        const keptTracks: Track[] = []
        let removedTracks = 0

        for (const track of tracks) {
            if (!isPlayableTrack(track)) {
                removedTracks++
                continue
            }
            if (probeResolvable) {
                const resolvable = await probeTrackResolvable(
                    queue,
                    track,
                    probeTimeoutMs,
                )
                if (!resolvable) {
                    removedTracks++
                    continue
                }
            }
            keptTracks.push(track)
        }

        queue.clear()
        for (const track of keptTracks) {
            queue.addTrack(track)
        }

        // Auto-replenishment after a rescue is autoplay-engine functionality,
        // currently deferred — see
        // decisions/2026-06-10-defer-autoplay-engine-extraction.md.
        return {
            removedTracks,
            keptTracks: keptTracks.length,
            addedTracks: 0,
        }
    } catch (error) {
        errorLog({ message: 'Error rescuing queue:', error })
        return {
            removedTracks: 0,
            keptTracks: queue.tracks.size,
            addedTracks: 0,
        }
    }
}

function getAllHistoryTracks(queue: GuildQueue): Track[] {
    return queue.history.tracks.data
}

export function getHistoryTracks(queue: GuildQueue): Track[] {
    return getAllHistoryTracks(queue).slice(0, HISTORY_SEED_LIMIT)
}

export { buildVcContributionWeights } from './autoplay/vcWeights'
