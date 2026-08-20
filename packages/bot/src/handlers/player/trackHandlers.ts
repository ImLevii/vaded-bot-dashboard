import type { Rainlink, RainlinkPlayer, RainlinkTrack } from 'rainlink'
import { ActivityType } from 'discord.js'
import type { Client } from 'discord.js'
import { LRUCache } from 'lru-cache'
import { infoLog, debugLog, errorLog } from '@lucky/shared/utils'
import { addTrackToHistory } from '../../utils/music/duplicateDetection'
import { constants } from '@lucky/shared/config'
import {
    sendNowPlayingEmbed,
    updateLastFmNowPlaying,
    scrobbleCurrentTrackIfLastFm,
    deleteSongInfoMessage,
    getSongInfoMessage,
} from './trackNowPlaying'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../utils/music/sessionSnapshots'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import {
    scheduleIdleDisconnect,
    clearIdleTimer,
} from '../../utils/music/idleDisconnect'
import { clearVotes } from '../../utils/music/voteSkipStore'
import { handleQueueExhaustion } from './queueExhaustion'
import type {
    RainlinkQueueAdapter,
    RainlinkTrackAdapter,
} from '../../utils/music/rainlinkAdapter'
import {
    wrapPlayer,
    wrapTrack,
    RainlinkLoopMode,
} from '../../utils/music/rainlinkAdapter'
import { guildRepeatCounts } from '../../functions/music/commands/repeat'

const MAX_GUILD_ENTRIES = 500
const TRACK_STATE_TTL_MS = 30 * 60 * 1000

export const lastPlayedTracks = new LRUCache<string, RainlinkTrackAdapter>({
    max: MAX_GUILD_ENTRIES,
    ttl: TRACK_STATE_TTL_MS,
    updateAgeOnGet: true,
})

export type TrackHistoryEntry = {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
}

export const recentlyPlayedTracks = new LRUCache<string, TrackHistoryEntry[]>({
    max: MAX_GUILD_ENTRIES,
    ttl: TRACK_STATE_TTL_MS,
    updateAgeOnGet: true,
})

function evictOldEntries(): void {
    for (const [guildId, entries] of recentlyPlayedTracks.entries()) {
        if (entries.length > MAX_GUILD_ENTRIES) {
            recentlyPlayedTracks.set(guildId, entries.slice(-MAX_GUILD_ENTRIES))
        }
    }
}

type SetupTrackHandlersParams = {
    player: Rainlink
    client: Client
}

/**
 * rainlink has a single `trackEnd` event (no discord-player-style split
 * between a natural finish and a manual skip) — the autoplay-outcome
 * accept/reject telemetry that used to live here relied on that split and on
 * `isAutoplay` track metadata that the (currently deferred) autoplay engine
 * would have set; both are dropped for now rather than faked. See
 * decisions/2026-06-10-defer-autoplay-engine-extraction.md.
 */
export const setupTrackHandlers = ({
    player,
    client,
}: SetupTrackHandlersParams): void => {
    player.on(
        'trackStart',
        (rainlinkPlayer: RainlinkPlayer, rawTrack: RainlinkTrack) => {
            const queue = wrapPlayer(rainlinkPlayer)
            const track = wrapTrack(rawTrack)
            clearIdleTimer(queue.guild.id)
            clearVotes(queue.guild.id)
            void handlePlayerStart(queue, track, client)
        },
    )
    player.on(
        'trackEnd',
        (rainlinkPlayer: RainlinkPlayer, rawTrack: RainlinkTrack) => {
            void handleTrackEnd(wrapPlayer(rainlinkPlayer), wrapTrack(rawTrack))
        },
    )
    player.on(
        'queueAdd',
        (rainlinkPlayer: RainlinkPlayer, _rlQueue, tracks: RainlinkTrack[]) => {
            const queue = wrapPlayer(rainlinkPlayer)
            if (Array.isArray(tracks) && tracks.length > 0) {
                infoLog({
                    message: `Added "${tracks[0].title}" to queue in guild ${queue.guild.id}`,
                })
            }
        },
    )
    player.on('queueEmpty', (rainlinkPlayer: RainlinkPlayer) => {
        const queue = wrapPlayer(rainlinkPlayer)
        scheduleIdleDisconnect(queue)
        client.user?.setPresence({ activities: [], status: 'online' })
    })
    // also clear presence when the bot is forcibly disconnected
    player.on('playerDestroy', () => {
        client.user?.setPresence({ activities: [], status: 'online' })
    })
}

const handlePlayerStart = async (
    queue: RainlinkQueueAdapter,
    track: RainlinkTrackAdapter,
    client: Client,
): Promise<void> => {
    try {
        evictOldEntries()
        lastPlayedTracks.set(queue.guild.id, track)
        infoLog({
            message: `Started playing "${track.title}" in guild ${queue.guild.id}`,
        })
        debugLog({ message: `Track URL: ${track.url}` })
        if (queue.node.volume !== constants.VOLUME)
            queue.node.setVolume(constants.VOLUME)

        try {
            // set "Listening to <track>" bot status
            client.user?.setActivity(track.title, {
                type: ActivityType.Listening,
            })
            // Every track gets its own message — except the one /play
            // pre-registers for the track it is about to start. That
            // registration carries no trackUrl yet (executePlayHandler has no
            // track when it registers), which is what distinguishes it from a
            // previous track's now-playing message. Dropping it unconditionally
            // made sendNowPlayingEmbed's edit path unreachable on the first
            // track, so the command's own reply was always followed by a
            // second, near-identical embed.
            const registered = getSongInfoMessage(queue.guild.id)
            if (registered?.trackUrl !== undefined) {
                deleteSongInfoMessage(queue.guild.id)
            }
            await sendNowPlayingEmbed(queue, track, false)
            await updateLastFmNowPlaying(queue, track)
            await voiceStatus.setTrackStatus(queue)
        } catch (error) {
            errorLog({ message: 'Error sending now playing message:', error })
        }

        await musicSessionSnapshotService.saveSnapshot(queue)
        musicWatchdogService.arm(queue)
    } catch (error) {
        errorLog({ message: 'Error in player start handler:', error })
    }
}

function decrementRepeatCount(queue: RainlinkQueueAdapter): void {
    const state = guildRepeatCounts.get(queue.guild.id)
    if (!state) return

    state.count -= 1
    if (state.count <= 0) {
        guildRepeatCounts.delete(queue.guild.id)
        queue.setRepeatMode(RainlinkLoopMode.NONE)
    }
}

const handleTrackEnd = async (
    queue: RainlinkQueueAdapter,
    track?: RainlinkTrackAdapter,
): Promise<void> => {
    try {
        decrementRepeatCount(queue)

        const trackToRecord = track ?? queue.currentTrack
        if (trackToRecord) {
            await scrobbleCurrentTrackIfLastFm(queue, trackToRecord)
            await addTrackToHistory(trackToRecord, queue.guild.id)
        }

        // Autoplay replenishment is deferred (see decisions/2026-06-10-defer-
        // autoplay-engine-extraction.md) — queue exhaustion just arms/clears
        // the watchdog and snapshot state, no automatic requeue.
        await handleQueueExhaustion(queue, async () => {})
    } catch (error) {
        errorLog({ message: 'Error in trackEnd event:', error })
    }
}
