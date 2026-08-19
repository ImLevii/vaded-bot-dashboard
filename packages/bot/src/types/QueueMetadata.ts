import type { TextChannel, User } from 'discord.js'
import type { CustomClient } from './CustomClient'

export interface QueueMetadata {
    channel?: TextChannel | null
    requestedBy?: User | null
    client?: CustomClient | null
    vcMemberIds?: string[]
    /**
     * Set by callers that connect a queue and restore its snapshot themselves
     * (watchdog.ts orphan recovery, sessionStartupRestore.ts) so the
     * 'connection' event handler in lifecycleHandlers.ts skips its own
     * restoreSnapshot call. Without this, both restores race: restoreSnapshot
     * no-ops once `queue.currentTrack` is set, so whichever call loses gets
     * `restoredCount: 0` while the winner has already started playback —
     * silently defeating the caller's own restore options (e.g. orphan
     * recovery's `skipCurrentTrack: true`, meant to avoid replaying a track
     * that already finished).
     */
    skipConnectionEventRestore?: boolean
}
