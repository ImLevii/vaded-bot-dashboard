import type { CustomClient } from '../../types'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { musicSessionSnapshotService } from './sessionSnapshots'
import { wrapPlayer } from './rainlinkAdapter'
import { createGuildPlayer } from './createGuildPlayer'

const STARTUP_MAX_AGE_MS = 30 * 60 * 1_000 // 30 minutes

/**
 * Restores guild session snapshots (now stored in Postgres) on startup by
 * rejoining the stored voice channel and re-queuing tracks.
 *
 * Called once from clientReady. Per-guild errors are isolated so one failure
 * does not abort the entire sweep.
 */
export async function restoreSessionsOnStartup(
    client: CustomClient,
): Promise<void> {
    if (!ENVIRONMENT_CONFIG.MUSIC.SESSION_RESTORE_ENABLED) return

    const guildIds = await musicSessionSnapshotService.listGuildIds()

    if (guildIds.length === 0) return

    infoLog({
        message: `Startup session sweep: found ${guildIds.length} snapshot(s)`,
    })

    for (const guildId of guildIds) {
        try {
            const guild = client.guilds.cache.get(guildId)
            if (!guild) {
                warnLog({
                    message:
                        'Startup session sweep: guild not in cache, skipping',
                    data: { guildId },
                })
                continue
            }

            const snapshot =
                await musicSessionSnapshotService.getSnapshot(guildId)
            if (!snapshot) continue

            if (!snapshot.voiceChannelId) {
                warnLog({
                    message:
                        'Startup session sweep: snapshot missing voiceChannelId, skipping',
                    data: { guildId },
                })
                continue
            }

            const ageMs = Date.now() - snapshot.savedAt
            if (ageMs > STARTUP_MAX_AGE_MS) {
                await musicSessionSnapshotService.deleteSnapshot(guildId)
                warnLog({
                    message: 'Startup session sweep: stale snapshot deleted',
                    data: { guildId, ageMs, maxAgeMs: STARTUP_MAX_AGE_MS },
                })
                continue
            }

            const channel = guild.channels.cache.get(snapshot.voiceChannelId)
            if (!channel?.isVoiceBased()) {
                warnLog({
                    message:
                        'Startup session sweep: voice channel not found or not voice-based',
                    data: { guildId, voiceChannelId: snapshot.voiceChannelId },
                })
                continue
            }

            // Do not rejoin + auto-play into an empty channel. Mirrors the
            // orphan-session watchdog's presence guard (watchdog.ts) so the bot
            // never surprises an empty room after a restart/redeploy.
            const humansPresent = channel.members.filter(
                (member) => !member.user.bot,
            ).size
            if (humansPresent === 0) {
                infoLog({
                    message:
                        'Startup session sweep: no humans in channel, skipping restore',
                    data: { guildId, voiceChannelId: snapshot.voiceChannelId },
                })
                continue
            }

            // skipConnectionEventRestore: this function owns the restore call
            // below, so the playerCreate event handler in lifecycleHandlers.ts
            // must not also restore. Without it, the two calls race — whichever
            // wins consumes the snapshot (restoreSnapshot() no-ops once
            // queue.currentTrack is set) and the loser silently reports
            // restoredCount: 0, undermining the diagnostics and any options
            // passed only to the call below.
            //
            // rainlink connects at creation time (voiceId is required up
            // front), so there's no separate connect step. No dedicated text
            // channel is known here, so the voice channel id is reused as
            // textId — most guild voice channels also support text chat.
            const rainlinkPlayer = await createGuildPlayer({
                rainlink: client.player,
                guild,
                voiceChannel: channel,
                textId: snapshot.voiceChannelId,
            })
            const queue = wrapPlayer(rainlinkPlayer)
            queue.setMetadata({
                channel: null,
                requestedBy: null,
                skipConnectionEventRestore: true,
            })

            const result = await musicSessionSnapshotService.restoreSnapshot(
                queue,
                undefined,
                {
                    maxAgeMs: STARTUP_MAX_AGE_MS,
                },
            )

            if (result.restoredCount > 0) {
                infoLog({
                    message: 'Startup session sweep: restored snapshot',
                    data: {
                        guildId,
                        restoredCount: result.restoredCount,
                        sessionSnapshotId: result.sessionSnapshotId,
                    },
                })
            }
        } catch (error) {
            errorLog({
                message:
                    'Startup session sweep: failed to restore snapshot for guild',
                error,
                data: { guildId },
            })
        }
    }
}
