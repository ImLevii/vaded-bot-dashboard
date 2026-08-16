import { EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { customCommandService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { applyPlaceholders, type PlaceholderContext } from './placeholders'

/**
 * Executes a dashboard-authored command invoked as a slash command.
 *
 * These are registered with Discord at runtime (see registration.ts) and are
 * therefore absent from the static `client.commands` collection, so the normal
 * dispatcher misses them. This is the fallback it calls before giving up.
 *
 * Returns false when no such command exists for the guild, letting the caller
 * keep its existing "unknown command" behaviour.
 */

type EmbedData = {
    title?: unknown
    description?: unknown
    color?: unknown
    imageUrl?: unknown
    footer?: unknown
}

function buildContext(
    interaction: ChatInputCommandInteraction,
): PlaceholderContext {
    const member = interaction.member as GuildMember | null
    return {
        userMention: `<@${interaction.user.id}>`,
        userName: member?.displayName ?? interaction.user.username,
        userId: interaction.user.id,
        guildName: interaction.guild?.name ?? '',
        guildId: interaction.guildId ?? '',
        memberCount: interaction.guild?.memberCount ?? 0,
        channelMention: `<#${interaction.channelId}>`,
    }
}

function buildEmbed(
    data: EmbedData,
    context: PlaceholderContext,
): EmbedBuilder | null {
    const embed = new EmbedBuilder()
    let populated = false

    if (typeof data.title === 'string' && data.title.trim()) {
        embed.setTitle(applyPlaceholders(data.title, context).slice(0, 256))
        populated = true
    }
    if (typeof data.description === 'string' && data.description.trim()) {
        embed.setDescription(
            applyPlaceholders(data.description, context).slice(0, 4096),
        )
        populated = true
    }
    if (typeof data.color === 'number') {
        embed.setColor(data.color)
    }
    if (
        typeof data.imageUrl === 'string' &&
        data.imageUrl.startsWith('https://')
    ) {
        embed.setImage(data.imageUrl)
        populated = true
    }
    if (typeof data.footer === 'string' && data.footer.trim()) {
        embed.setFooter({
            text: applyPlaceholders(data.footer, context).slice(0, 2048),
        })
        populated = true
    }

    return populated ? embed : null
}

export async function executeCustomCommand(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    const guildId = interaction.guildId
    if (!guildId) return false

    let command
    try {
        command = await customCommandService.getCommand(
            guildId,
            interaction.commandName,
        )
    } catch (error) {
        errorLog({
            message: `customCommands: lookup failed for ${interaction.commandName}`,
            error,
        })
        return false
    }

    if (!command || !command.enabled) return false

    // Same gate the message-triggered path enforces before acting: a command
    // can ping roles, so an unrestricted trigger is a privilege-escalation
    // vector (ADR 2026-07-03). Here the user gets told, rather than being
    // silently ignored, because they explicitly invoked it.
    const member = interaction.member as GuildMember | null
    const userRoles = member?.roles?.cache?.map((r) => r.id) ?? []
    if (
        !customCommandService.canUseCommand(
            command,
            userRoles,
            interaction.channelId,
        )
    ) {
        await interaction.reply({
            content: 'You cannot use this command here.',
            flags: MessageFlags.Ephemeral,
        })
        return true
    }

    const context = buildContext(interaction)
    const embed =
        command.embedData && typeof command.embedData === 'object'
            ? buildEmbed(command.embedData as EmbedData, context)
            : null
    const content = command.response
        ? applyPlaceholders(command.response, context).slice(0, 2000)
        : ''

    if (!embed && !content) {
        await interaction.reply({
            content: 'This command has no response configured.',
            flags: MessageFlags.Ephemeral,
        })
        return true
    }

    await interaction.reply({
        ...(content ? { content } : {}),
        ...(embed ? { embeds: [embed] } : {}),
        // Responses are author-controlled text; never let one mass-ping.
        allowedMentions: { parse: [] },
    })

    try {
        await customCommandService.incrementUsage(guildId, command.name)
    } catch (error) {
        errorLog({
            message: `customCommands: failed to record usage for ${command.name}`,
            error,
        })
    }

    return true
}
