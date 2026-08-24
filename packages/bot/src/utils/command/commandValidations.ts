import type { ChatInputCommandInteraction } from 'discord.js'
import { errorEmbed } from '../general/embeds'
import { interactionReply } from '../general/interactionReply'
import { handleError, createUserErrorMessage } from '@lucky/shared/utils'

export async function requireGuild(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!interaction.guildId) {
        const error = handleError(
            new Error('Command can only be used in a guild/server'),
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireInteractionOptions(
    interaction: ChatInputCommandInteraction,
    options: string[],
) {
    if (!options.includes(interaction.options.getSubcommand() ?? '')) {
        const error = handleError(new Error('Invalid interaction option'), {
            guildId: interaction.guildId ?? undefined,
            userId: interaction.user.id,
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}
