import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'

// Temporarily unavailable — this command drove discord-player's FFmpeg-based
// filter chain (queue.filters.ffmpeg/.resampler), which has no direct
// equivalent under rainlink (Lavalink applies filters server-side via
// RainlinkPlayer#filter, a different prebuilt-filter-name model). Needs a
// dedicated rewrite, not part of the core-playback scope of the Lavalink
// migration.
export default new Command({
    data: new SlashCommandBuilder()
        .setName('effects')
        .setDescription(
            '<a:music:741605543046807626> Apply audio effects to the current track',
        )
        .addSubcommand((sub) =>
            sub
                .setName('bassboost')
                .setDescription('Set bass boost level (0-5)')
                .addIntegerOption((opt) =>
                    opt
                        .setName('level')
                        .setDescription('Bass boost level')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(5),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('nightcore')
                .setDescription('Toggle nightcore audio effect'),
        )
        .addSubcommand((sub) =>
            sub.setName('reset').setDescription('Clear all audio effects'),
        ),
    category: 'music',
    execute: async ({ interaction }: CommandExecuteParams) => {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Temporarily unavailable',
                        'Audio effects are being rebuilt for the new Lavalink-based player and are not available right now.',
                    ),
                ],
                ephemeral: true,
            },
        })
    },
})
