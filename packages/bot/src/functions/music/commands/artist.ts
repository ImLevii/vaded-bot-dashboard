import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { createErrorEmbed } from '../../../utils/general/embeds'
import { interactionReply } from '../../../utils/general/interactionReply'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20

// Temporarily unavailable — this command's artist-top-tracks-to-queue flow
// was built directly against discord-player's Player#play()/#search()
// one-shot API, which rainlink has no equivalent for. Not part of the
// core-playback scope of the Lavalink migration; needs a dedicated rewrite.
export default new Command({
    data: new SlashCommandBuilder()
        .setName('artist')
        .setDescription('Queue top tracks from a specific artist')
        .addStringOption((option) =>
            option
                .setName('name')
                .setDescription('Artist name')
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName('limit')
                .setDescription(
                    `Tracks to queue (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
                )
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(MAX_LIMIT),
        ),
    category: 'music',
    execute: async ({ interaction }: CommandExecuteParams): Promise<void> => {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Temporarily unavailable',
                        'This command is being rebuilt for the new Lavalink-based player and is not available right now.',
                    ),
                ],
                ephemeral: true,
            },
        })
    },
})
