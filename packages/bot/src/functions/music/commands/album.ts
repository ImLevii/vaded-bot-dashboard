import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { createErrorEmbed } from '../../../utils/general/embeds'
import { interactionReply } from '../../../utils/general/interactionReply'

// Temporarily unavailable — this command's Spotify-album-to-queue flow was
// built directly against discord-player's Player#play()/#search() one-shot
// API, which rainlink has no equivalent for. Not part of the core-playback
// scope of the Lavalink migration; needs a dedicated rewrite.
export default new Command({
    data: new SlashCommandBuilder()
        .setName('album')
        .setDescription('Queue all tracks from a specific album')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('Album name or Spotify album URL')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('artist')
                .setDescription('Artist name to narrow the search (optional)')
                .setRequired(false),
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
