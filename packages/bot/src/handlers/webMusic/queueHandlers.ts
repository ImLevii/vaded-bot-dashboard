import type { CustomClient } from '../../types'
import {
    musicControlService,
    type MusicCommand,
    type MusicCommandResult,
} from '@lucky/shared/services'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { buildQueueState } from './mappers'
import { resolveGuildQueue } from '../../utils/music/queueResolver'
import {
    normalizeSpotifyUrl,
    normalizeYoutubeUrl,
} from '../../functions/music/commands/play/urlNormalization'
import { buildWebNodeOptions, resolveWebPlayContext } from './playContext'

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

export async function handleQueueMove(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = resolveGuildQueue(client, cmd.guildId).queue
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')

    const from = cmd.data?.from as number
    const to = cmd.data?.to as number
    const tracksArray = queue.tracks.toArray()

    if (
        from < 0 ||
        from >= tracksArray.length ||
        to < 0 ||
        to >= tracksArray.length
    ) {
        return fail(cmd.id, cmd.guildId, 'Invalid track positions')
    }

    const [moved] = tracksArray.splice(from, 1)
    tracksArray.splice(to, 0, moved)
    queue.tracks.clear()
    for (const track of tracksArray) queue.addTrack(track)

    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

export async function handleQueueRemove(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = resolveGuildQueue(client, cmd.guildId).queue
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')

    const index = cmd.data?.index as number
    if (index < 0 || index >= queue.tracks.toArray().length) {
        return fail(cmd.id, cmd.guildId, 'Invalid track index')
    }

    queue.removeTrack(index)
    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

export async function handleQueueClear(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = resolveGuildQueue(client, cmd.guildId).queue
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')

    queue.tracks.clear()
    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

export async function handleImportPlaylist(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const rawUrl = cmd.data?.url as string
    if (!rawUrl) return fail(cmd.id, cmd.guildId, 'No URL provided')

    // Strip tracking params that cause Spotify/YouTube extractors to reject the URL
    const url = normalizeSpotifyUrl(normalizeYoutubeUrl(rawUrl))

    const voiceChannelId = cmd.data?.voiceChannelId as string | undefined
    const guild = client.guilds.cache.get(cmd.guildId)
    if (!guild) return fail(cmd.id, cmd.guildId, 'Guild not found')

    const requestedBy = await client.users
        .fetch(cmd.userId)
        .catch(() => undefined)
    const result = await client.player.search(url, { requestedBy })
    if (!result?.tracks.length)
        return fail(cmd.id, cmd.guildId, 'No tracks found in playlist')

    let queue = resolveGuildQueue(client, cmd.guildId).queue

    if (!queue) {
        // No active queue — join voice and create one. The voice channel comes
        // from the requester's own voice state when the dashboard couldn't
        // supply one (it only knows the *bot's* channel, which is null until
        // the bot is already connected — a circular dependency that made
        // web-initiated imports impossible).
        const resolved = await resolveWebPlayContext(
            client,
            guild,
            cmd.userId,
            voiceChannelId,
        )
        if (!resolved.ok) return fail(cmd.id, cmd.guildId, resolved.error)

        // Play the first track to establish the queue and connection.
        // metadata.channel must be a real text channel: trackNowPlaying.ts
        // returns early without one, which silently suppressed the Now
        // Playing embed for every web-started session.
        await client.player.play(
            resolved.context.voiceChannel,
            result.tracks[0],
            {
                requestedBy,
                nodeOptions: buildWebNodeOptions(
                    resolved.context,
                    ENVIRONMENT_CONFIG.PLAYER.CONNECTION_TIMEOUT,
                ),
            },
        )
        // Add remaining tracks to the newly created queue
        queue = resolveGuildQueue(client, cmd.guildId).queue
        if (queue && result.tracks.length > 1) {
            for (const track of result.tracks.slice(1)) queue.addTrack(track)
        }
    } else {
        // Deduplicate against tracks already in the queue by URL
        const existingUrls = new Set(
            queue.tracks.toArray().map((t: { url: string }) => t.url),
        )
        for (const track of result.tracks) {
            if (!existingUrls.has(track.url)) {
                queue.addTrack(track)
                existingUrls.add(track.url)
            }
        }
        if (!queue.node.isPlaying() && !queue.node.isPaused())
            await queue.node.play()
    }

    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)

    return ok(cmd.id, cmd.guildId, {
        tracksAdded: result.tracks.length,
        playlistName: result.playlist?.title ?? 'Unknown Playlist',
        source: detectSource(url),
    })
}

function detectSource(url: string): string {
    if (url.includes('spotify')) return 'spotify'
    if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube'
    return 'unknown'
}
