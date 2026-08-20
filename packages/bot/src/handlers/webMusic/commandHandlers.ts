import type { Guild } from 'discord.js'
import type { CustomClient } from '../../types'
import {
    musicControlService,
    type MusicCommand,
    type MusicCommandResult,
} from '@lucky/shared/services'
import { buildQueueState, repeatModeToEnum } from './mappers'
import { resolveGuildQueue } from '../../utils/music/queueResolver'
import { setReplenishSuppressed } from '../../utils/music/replenishSuppressionStore'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { musicSessionSnapshotService } from '../../utils/music/sessionSnapshots'
import { clearSessionMoodCache } from '../../utils/music/autoplay/replenisher'
import {
    normalizeYoutubeUrl,
    normalizeSpotifyUrl,
    cleanQueryInput,
} from '../../functions/music/commands/play/urlNormalization'
import { resolveQueryWithFallbacks } from '../../functions/music/commands/play/handlers/resolveProvider'
import { resolveWebPlayContext } from './playContext'

type Result = MusicCommandResult

function fail(id: string, guildId: string, error: string): Result {
    return { id, guildId, success: false, error, timestamp: Date.now() }
}

function ok(
    id: string,
    guildId: string,
    data?: Record<string, unknown>,
): Result {
    return { id, guildId, success: true, data, timestamp: Date.now() }
}

async function publishAndOk(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

function getQueue(client: CustomClient, guildId: string) {
    return resolveGuildQueue(client, guildId).queue
}

export async function handleGetState(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

/**
 * Joins voice and creates the queue for a dashboard-initiated play when no
 * session exists yet — the web equivalent of the Discord `/play` cold start.
 */
async function startWebSession(
    client: CustomClient,
    cmd: MusicCommand,
    guild: Guild,
    query: string,
    voiceChannelId: string | undefined,
): Promise<Result> {
    const resolved = await resolveWebPlayContext(
        client,
        guild,
        cmd.userId,
        voiceChannelId,
    )
    if (!resolved.ok) return fail(cmd.id, cmd.guildId, resolved.error)

    setReplenishSuppressed(cmd.guildId, 0)
    const vcMemberIds = Array.from(
        resolved.context.voiceChannel.members.values(),
    )
        .filter((member) => !member.user.bot)
        .map((member) => member.id)

    if (!resolved.context.requestedBy) {
        return fail(cmd.id, cmd.guildId, 'Could not resolve requesting user')
    }

    const { result } = await resolveQueryWithFallbacks({
        client,
        guildId: cmd.guildId,
        textId:
            resolved.context.textChannel?.id ??
            resolved.context.voiceChannel.id,
        channel: resolved.context.textChannel,
        voiceChannel: resolved.context.voiceChannel,
        query,
        requestedProvider: 'default',
        requestedBy: resolved.context.requestedBy,
        vcMemberIds,
    })

    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)

    const isPlaylist = !!result.searchResult.playlist
    return ok(cmd.id, cmd.guildId, {
        tracksAdded: isPlaylist ? result.searchResult.tracks.length : 1,
        isPlaylist,
        title: result.searchResult.playlist?.title ?? result.track.title,
    })
}

export async function handlePlay(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const rawQuery = cleanQueryInput(cmd.data?.query as string)
    if (!rawQuery) return fail(cmd.id, cmd.guildId, 'No query provided')
    const query = normalizeSpotifyUrl(normalizeYoutubeUrl(rawQuery))

    const guild = client.guilds.cache.get(cmd.guildId)
    if (!guild) return fail(cmd.id, cmd.guildId, 'Guild not found')

    const voiceChannelId = cmd.data?.voiceChannelId as string | undefined
    const existingQueue = getQueue(client, cmd.guildId)

    // No live session yet — start one exactly as the Discord `/play` path
    // does (join voice, create the queue with a text channel in metadata so
    // the Now Playing embed fires, and use the same provider fallback chain)
    // instead of refusing with "start playing from Discord first".
    if (!existingQueue) {
        return startWebSession(client, cmd, guild, query, voiceChannelId)
    }

    const requestedBy = await client.users
        .fetch(cmd.userId)
        .catch(() => undefined)
    const result = await existingQueue.search(query, { requestedBy })
    if (!result?.tracks.length)
        return fail(cmd.id, cmd.guildId, 'No results found')

    const queue = existingQueue

    setReplenishSuppressed(cmd.guildId, 0)
    for (const track of result.tracks) queue.addTrack(track)

    if (!queue.node.isPlaying() && !queue.node.isPaused())
        await queue.node.play()

    const isPlaylist = result.tracks.length > 1
    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId, {
        tracksAdded: isPlaylist ? result.tracks.length : 1,
        isPlaylist,
        title: result.playlistName ?? result.tracks[0].title,
    })
}

export async function handlePause(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    await queue.node.pause()
    return publishAndOk(client, cmd)
}

export async function handleResume(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    await queue.node.resume()
    return publishAndOk(client, cmd)
}

export async function handleSkip(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    await queue.node.skip()
    if (!queue.node.isPlaying()) await queue.node.play()
    return publishAndOk(client, cmd)
}

export async function handleStop(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')

    // Tear down exactly like the /stop slash command (functions/music/
    // commands/stop.ts). Without markIntentionalStop() the watchdog reads the
    // deliberate stop as an orphaned session and rejoins the channel, and
    // without deleteSnapshot() the surviving snapshot restores the queue that
    // was just cleared — so a dashboard stop reported "queue cleared" while
    // dozens of tracks came back moments later.
    musicWatchdogService.markIntentionalStop(cmd.guildId)
    await musicSessionSnapshotService.deleteSnapshot(cmd.guildId)
    clearSessionMoodCache(cmd.guildId)

    await queue.node.stop()
    queue.clear()
    await queue.delete()
    setReplenishSuppressed(cmd.guildId, 30_000)
    return publishAndOk(client, cmd)
}

export async function handleVolume(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    await queue.node.setVolume(cmd.data?.volume as number)
    return publishAndOk(client, cmd)
}

export async function handleShuffle(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.tracks.shuffle()
    return publishAndOk(client, cmd)
}

export async function handleRepeat(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.setRepeatMode(repeatModeToEnum(cmd.data?.mode as string))
    return publishAndOk(client, cmd)
}

export async function handleSeek(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    await queue.node.seek(cmd.data?.position as number)
    return publishAndOk(client, cmd)
}

export async function handlePrevious(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')

    // Per #1239: when no previous track, restart current track from beginning
    if (!queue.history.previousTrack) {
        const currentTrack = queue.currentTrack
        if (currentTrack) {
            await queue.node.seek(0)
        }
    } else {
        await queue.history.back()
    }

    if (!queue.node.isPlaying()) await queue.node.play()
    return publishAndOk(client, cmd)
}
