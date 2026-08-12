import { ChannelType, PermissionsBitField } from 'discord.js'
import type { Guild, TextChannel, User, VoiceBasedChannel } from 'discord.js'
import type { CustomClient } from '../../types'

/**
 * Dashboard playback has no interaction to read a voice/text channel from, so
 * both are resolved here instead:
 *
 * - **Voice:** an explicit `voiceChannelId` when the caller supplied one,
 *   otherwise the requesting user's own current voice channel. The dashboard
 *   can only send the *bot's* channel (from queue state), which is null until
 *   the bot is already connected — so without the user-voice-state fallback,
 *   starting playback from the web is impossible by construction.
 * - **Text:** where the Now Playing embed goes. `trackNowPlaying.ts` bails out
 *   when `queue.metadata.channel` is unset, so leaving it null (as the import
 *   handler previously did) silently suppresses the embed for every
 *   web-started session.
 */

export interface WebPlayContext {
    voiceChannel: VoiceBasedChannel
    textChannel: TextChannel | null
    requestedBy: User | undefined
}

export type WebPlayContextResult =
    | { ok: true; context: WebPlayContext }
    | { ok: false; error: string }

/** First text channel the bot may actually post in — system channel preferred. */
export function resolveAnnouncementChannel(guild: Guild): TextChannel | null {
    const me = guild.members.me
    if (!me) return null

    const canPost = (channel: TextChannel): boolean =>
        channel
            .permissionsFor(me)
            ?.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
            ]) ?? false

    const system = guild.systemChannel
    if (system && canPost(system)) return system

    const fallback = guild.channels.cache.find(
        (channel): channel is TextChannel =>
            channel.type === ChannelType.GuildText &&
            canPost(channel as TextChannel),
    )

    return fallback ?? null
}

export async function resolveWebPlayContext(
    client: CustomClient,
    guild: Guild,
    userId: string,
    explicitVoiceChannelId?: string,
): Promise<WebPlayContextResult> {
    const requestedBy = await client.users.fetch(userId).catch(() => undefined)

    const explicitChannel = explicitVoiceChannelId
        ? guild.channels.cache.get(explicitVoiceChannelId)
        : undefined
    if (explicitVoiceChannelId && !explicitChannel?.isVoiceBased()) {
        return { ok: false, error: 'Voice channel not found' }
    }

    // Fetch (not cache-only): the requester's voice state is frequently
    // absent from cache on a relay-driven command.
    const voiceChannel: VoiceBasedChannel | null =
        explicitChannel?.isVoiceBased()
            ? explicitChannel
            : ((await guild.members.fetch(userId).catch(() => null))?.voice
                  .channel ?? null)

    if (!voiceChannel) {
        return {
            ok: false,
            error: 'Join a voice channel in Discord first, then try again.',
        }
    }

    const me = guild.members.me
    if (
        me &&
        !voiceChannel
            .permissionsFor(me)
            ?.has([
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
            ])
    ) {
        return {
            ok: false,
            error: `Missing permission to join or speak in ${voiceChannel.name}.`,
        }
    }

    return {
        ok: true,
        context: {
            voiceChannel,
            textChannel: resolveAnnouncementChannel(guild),
            requestedBy,
        },
    }
}

/** Queue options mirroring the Discord `/play` path so both behave identically. */
export function buildWebNodeOptions(
    context: WebPlayContext,
    connectionTimeout: number,
) {
    const vcMemberIds = Array.from(context.voiceChannel.members.values())
        .filter((member) => !member.user.bot)
        .map((member) => member.id)

    return {
        metadata: {
            channel: context.textChannel,
            requestedBy: context.requestedBy ?? null,
            vcMemberIds,
        },
        connectionTimeout,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 30_000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 300_000,
    }
}
