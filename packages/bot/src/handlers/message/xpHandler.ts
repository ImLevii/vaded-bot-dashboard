import type { Message, TextChannel } from 'discord.js'
import { levelService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { renderLevelUpMessage } from './levelUpMessage'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from './types'

export const xpHandler: MessageHandler = {
    name: 'XP',

    async canHandle(
        message: Message,
        _context: MessageContext,
    ): Promise<boolean> {
        return !message.author.bot
    },

    async handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult> {
        try {
            const guildId = context.guild.id
            const userId = message.author.id

            const config = await levelService.getConfig(guildId)
            if (!config || !config.enabled) {
                return { stop: false }
            }

            // Defaulted rather than read directly: XP is awarded on every
            // message, so a config row missing these (older row, partial
            // migration) must degrade to "nothing ignored" instead of
            // throwing and silently stopping XP for the whole guild.
            const ignoredChannels = config.ignoredChannels ?? []
            const ignoredRoles = config.ignoredRoles ?? []
            const memberRoles =
                context.member.roles?.cache?.map((r) => r.id) ?? []

            if (
                ignoredChannels.includes(message.channelId) ||
                memberRoles.some((role) => ignoredRoles.includes(role))
            ) {
                return { stop: false }
            }

            const current = await levelService.getMemberXP(guildId, userId)
            const now = Date.now()

            if (
                current &&
                now - current.lastXpAt.getTime() < config.xpCooldownMs
            ) {
                return { stop: false }
            }

            const result = await levelService.addXP(
                guildId,
                userId,
                config.xpPerMessage,
                message.member?.displayName ?? message.author.username,
            )

            if (result.leveledUp) {
                // Grant every reward in the crossed range, not just the one
                // matching newLevel: addXP walks multiple levels for a single
                // message, so an exact match skipped rewards for the levels
                // passed through on the way up.
                const rewards = await levelService.getRewards(guildId)
                const earned = rewards.filter(
                    (r: { level: number }) =>
                        r.level > result.previousLevel &&
                        r.level <= result.newLevel,
                )

                for (const reward of earned) {
                    await context.member.roles
                        .add(reward.roleId)
                        .catch(() => {})
                }

                // With stacking off, a new reward replaces the older ones so a
                // member wears only their current tier.
                if (!config.stackRewards && earned.length > 0) {
                    const superseded = rewards.filter(
                        (r: { level: number; roleId: string }) =>
                            r.level <= result.previousLevel &&
                            memberRoles.includes(r.roleId),
                    )
                    for (const stale of superseded) {
                        await context.member.roles
                            .remove(stale.roleId)
                            .catch(() => {})
                    }
                }

                // Announcing is independent of granting. Reward granting used
                // to live inside this branch, so any guild that had not set an
                // announce channel never handed out reward roles at all.
                await announceLevelUp(message, context, {
                    config,
                    level: result.newLevel,
                    rewardMentions: earned.map(
                        (r: { roleId: string }) => `<@&${r.roleId}>`,
                    ),
                })
            }

            return { stop: false }
        } catch (error) {
            errorLog({
                message: 'Error handling XP:',
                error,
            })
            return { stop: false }
        }
    },
}

type AnnounceArgs = {
    config: {
        announceMode?: string | null
        announceChannel: string | null
        levelUpMessage?: string | null
    }
    level: number
    rewardMentions: string[]
}

async function announceLevelUp(
    message: Message,
    _context: MessageContext,
    { config, level, rewardMentions }: AnnounceArgs,
): Promise<void> {
    // 'channel' is the historical behaviour and the column default.
    const mode = config.announceMode ?? 'channel'
    if (mode === 'off') return

    const content = renderLevelUpMessage(config.levelUpMessage, {
        userMention: `<@${message.author.id}>`,
        level,
        rewardMentions,
    })

    try {
        if (mode === 'dm') {
            await message.author.send(content).catch(() => {})
            return
        }

        if (mode === 'current') {
            if (message.channel.isTextBased() && 'send' in message.channel) {
                await (message.channel as TextChannel).send(content)
            }
            return
        }

        // Default 'channel' mode: only announce when a target is configured.
        if (!config.announceChannel) return
        const rawChannel = await message.client.channels
            .fetch(config.announceChannel)
            .catch(() => null)
        if (rawChannel?.isTextBased()) {
            await (rawChannel as TextChannel).send(content)
        }
    } catch (error) {
        errorLog({ message: 'Failed to announce level up:', error })
    }
}
