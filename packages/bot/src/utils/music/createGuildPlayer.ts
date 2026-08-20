import { PermissionsBitField } from 'discord.js'
import type { Guild, VoiceBasedChannel } from 'discord.js'
import type { Rainlink, RainlinkPlayer } from 'rainlink'

/**
 * Single entry point for creating a rainlink player, wrapping the two failure
 * modes that are otherwise invisible.
 *
 * rainlink joins voice by handing an op4 gateway packet to
 * `client.ws.shards.get(shardId)?.send(...)` and then waiting up to
 * `voiceConnectionTimeout` for Discord to answer with VOICE_SERVER_UPDATE.
 * Both halves fail silently:
 *
 *  - The `?.` means an unresolvable shard id drops the packet on the floor —
 *    no throw, no log, just a 15s wait and a generic timeout.
 *  - If the bot cannot actually join the channel (missing View/Connect/Speak,
 *    or the channel is at its user limit), Discord answers the state update
 *    with `channel_id: null` and never sends a server update — again, the same
 *    generic timeout.
 *
 * Either way the operator sees "The voice connection is not established in
 * 15000ms" and nothing else. Check both up front, and rewrite the timeout into
 * something that names the guild/channel and the things actually worth
 * checking.
 */

export class VoiceJoinError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'VoiceJoinError'
    }
}

/** Why the bot cannot join this channel, or null when it can. */
export function voiceJoinBlocker(
    guild: Guild,
    voiceChannel: VoiceBasedChannel,
): string | null {
    const me = guild.members.me
    if (!me) return 'the bot is not a member of this server'

    const permissions = voiceChannel.permissionsFor(me)
    if (!permissions) return `permissions for ${voiceChannel.name} could not be resolved`

    const missing = [
        [PermissionsBitField.Flags.ViewChannel, 'View Channel'],
        [PermissionsBitField.Flags.Connect, 'Connect'],
        [PermissionsBitField.Flags.Speak, 'Speak'],
    ]
        .filter(([flag]) => !permissions.has(flag as bigint))
        .map(([, label]) => label as string)

    if (missing.length > 0) {
        return `missing ${missing.join(', ')} permission(s) in ${voiceChannel.name}`
    }

    // A full channel refuses the bot as well, unless it can move members past
    // the limit. Discord signals this the same way it signals a permission
    // failure: silence on the server-update side.
    const atCapacity =
        voiceChannel.userLimit > 0 &&
        voiceChannel.members.size >= voiceChannel.userLimit
    if (atCapacity && !permissions.has(PermissionsBitField.Flags.MoveMembers)) {
        return `${voiceChannel.name} is full (${voiceChannel.members.size}/${voiceChannel.userLimit})`
    }

    return null
}

type CreateGuildPlayerParams = {
    rainlink: Rainlink
    guild: Guild
    voiceChannel: VoiceBasedChannel
    textId: string
    volume?: number
}

export async function createGuildPlayer({
    rainlink,
    guild,
    voiceChannel,
    textId,
    volume,
}: CreateGuildPlayerParams): Promise<RainlinkPlayer> {
    const blocker = voiceJoinBlocker(guild, voiceChannel)
    if (blocker) {
        throw new VoiceJoinError(`Cannot join voice: ${blocker}.`)
    }

    // `Guild#shardId` is populated from GUILD_CREATE and is the same key
    // `client.ws.shards` is indexed by; if it does not resolve, rainlink's
    // send is a no-op and the join can only ever time out.
    const shardId = guild.shardId
    const shard = guild.client.ws.shards.get(shardId)
    if (!shard) {
        throw new VoiceJoinError(
            `Cannot join voice: gateway shard ${String(shardId)} is not available ` +
                `(shards: ${[...guild.client.ws.shards.keys()].join(', ') || 'none'}). ` +
                'The voice request cannot reach Discord.',
        )
    }

    try {
        return await rainlink.create({
            guildId: guild.id,
            textId,
            voiceId: voiceChannel.id,
            shardId,
            ...(volume === undefined ? {} : { volume }),
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('voice connection is not established')) throw error

        throw new VoiceJoinError(
            `Timed out joining ${voiceChannel.name} in ${guild.name}: Discord never confirmed the ` +
                'voice connection. Check that the bot can join that channel, and that the ' +
                'GuildVoiceStates intent is enabled for the application. ' +
                `(guild=${guild.id} channel=${voiceChannel.id} shard=${String(shardId)})`,
        )
    }
}
