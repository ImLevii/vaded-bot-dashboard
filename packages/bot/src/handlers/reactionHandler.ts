import {
    Events,
    type Client,
    type MessageReaction,
    type User,
    type PartialMessageReaction,
    type PartialUser,
    type TextChannel,
} from 'discord.js'
import { starboardService, giveawayService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

async function handleGiveawayReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
): Promise<void> {
    if (user.bot) return
    if (user.partial) await user.fetch()

    if (reaction.emoji.name !== '🎉') return

    const giveaway = await giveawayService.getActiveByMessageId(
        reaction.message.id,
    )
    if (!giveaway) return

    // Only allow entries for active (not ended) giveaways
    if (giveaway.endedAt) return

    await giveawayService.addEntry(giveaway.id, user.id)
}

export async function handleStarboardReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    client: Client,
): Promise<void> {
    if (reaction.partial) await reaction.fetch()
    if (user.partial) await user.fetch()
    if (!reaction.message.guild) return
    if (user.bot) return

    const guildId = reaction.message.guild.id
    const config = await starboardService.getConfig(guildId)
    if (!config) return

    const emoji = reaction.emoji.name ?? ''
    if (emoji !== config.emoji) return

    const msg = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message

    if (!config.selfStar && msg.author?.id === user.id) return

    // One-time DM introducing the starboard the first time a member stars
    // anything (per-guild opt-in; text overridable per guild).
    if (config.firstStarDm) {
        const first = await starboardService
            .tryClaimFirstStarDm(guildId, user.id)
            .catch(() => false)
        if (first) {
            const dmText =
                config.firstStarDmMessage ??
                `${config.emoji} You just starred a message! When a message collects ${config.threshold}× ${config.emoji}, it gets featured in <#${config.channelId}>.`
            await (user as User).send(dmText).catch(() => undefined)
        }
    }

    // The bot's own seed reaction must never count toward the threshold.
    const starCount = Math.max(0, (reaction.count ?? 1) - (reaction.me ? 1 : 0))
    const entry = await starboardService.upsertEntry(guildId, msg.id, {
        channelId: msg.channelId,
        authorId: msg.author?.id ?? '',
        content: msg.content ?? undefined,
        starCount,
    })

    if (starCount < config.threshold) return

    const rawChannel = await client.channels
        .fetch(config.channelId)
        .catch(() => null)
    if (!rawChannel || !rawChannel.isTextBased()) return
    const channel = rawChannel as TextChannel

    const starEmbed = {
        color: 0xffd700,
        description: msg.content ?? '*(no text content)*',
        fields: [{ name: 'Source', value: `[Jump to message](${msg.url})` }],
        footer: {
            text: `${config.emoji} ${starCount} • #${msg.channel && 'name' in msg.channel ? msg.channel.name : 'unknown'}`,
        },
        author: {
            name: msg.author?.username ?? 'Unknown',
            icon_url: msg.author?.displayAvatarURL() ?? undefined,
        },
    }

    if (entry.starboardMsgId) {
        const starMsg = await channel.messages
            .fetch(entry.starboardMsgId)
            .catch(() => null)
        if (starMsg) await starMsg.edit({ embeds: [starEmbed] })
    } else {
        const posted = await channel.send({ embeds: [starEmbed] })
        await starboardService.upsertEntry(guildId, msg.id, {
            channelId: msg.channelId,
            authorId: msg.author?.id ?? '',
            content: msg.content ?? undefined,
            starCount,
            starboardMsgId: posted.id,
        })
    }
}

export function handleReactionEvents(client: Client): void {
    client.on(
        Events.MessageReactionAdd,
        async (
            reaction: MessageReaction | PartialMessageReaction,
            user: User | PartialUser,
        ) => {
            try {
                await handleGiveawayReaction(reaction, user)
                await handleStarboardReaction(reaction, user, client)
            } catch (error) {
                errorLog({ message: 'Error handling reaction:', error })
            }
        },
    )
}
