import type {
    ChatInputCommandInteraction,
    SendableChannels,
    VoiceChannel,
    GuildMember,
} from 'discord.js'
import type { CustomClient } from '../types'
import type { RainlinkQueueAdapter as GuildQueue } from '../utils/music/rainlinkAdapter'
import { wrapPlayer } from '../utils/music/rainlinkAdapter'

class ValidationError extends Error {
    constructor(
        message: string,
        public details?: unknown,
    ) {
        super(message)
        this.name = 'ValidationError'
    }
}

type CreateQueueParams = {
    client: CustomClient
    interaction: ChatInputCommandInteraction
}

type QueueConnectParams = {
    queue: GuildQueue
    interaction: ChatInputCommandInteraction
}

/**
 * rainlink requires the voice channel up front (`Rainlink#create` takes
 * `voiceId` as part of `VoiceChannelOptions`), unlike discord-player's
 * separate create-then-connect steps — so this now does both in one call.
 * `queueConnect` stays as a no-op export purely so existing two-step call
 * sites (e.g. functions/music/commands/session.ts) don't need to change.
 */
export const createQueue = async ({
    client,
    interaction,
}: CreateQueueParams): Promise<GuildQueue> => {
    if (!interaction.guild) {
        throw new ValidationError('Guild not found in interaction', {
            userId: interaction.user?.id,
            channelId: interaction.channel?.id,
        })
    }

    const voiceChannel = (interaction.member as GuildMember)?.voice
        .channel as VoiceChannel
    if (!voiceChannel) {
        throw new ValidationError('User is not in a voice channel', {
            userId: interaction.user?.id,
        })
    }

    const rainlinkPlayer = await client.player.create({
        guildId: interaction.guild.id,
        textId: interaction.channelId,
        voiceId: voiceChannel.id,
        shardId: interaction.guild.shardId,
    })

    const queue = wrapPlayer(rainlinkPlayer)
    queue.setMetadata({
        channel: interaction.channel as SendableChannels | null,
        client,
        requestedBy: interaction.user,
    })

    return queue
}

export const queueConnect = async ({
    queue,
}: QueueConnectParams): Promise<void> => {
    await queue.connect()
}
