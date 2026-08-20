import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('🔄 Manage autoplay tracks in the queue')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('skip')
                .setDescription(
                    'Skip the first autoplay track and replenish queue',
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('clear')
                .setDescription(
                    'Remove all autoplay tracks and replenish queue',
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('status')
                .setDescription('Show autoplay queue status'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('analytics')
                .setDescription('Show autoplay stats and top artists'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('mode')
                .setDescription('Get or set autoplay recommendation mode')
                .addStringOption((opt) =>
                    opt
                        .setName('mode')
                        .setDescription(
                            'similar (default) | discover | popular',
                        )
                        .addChoices(
                            {
                                name: "<a:music:741605543046807626> Similar — music like what's playing",
                                value: 'similar',
                            },
                            {
                                name: '🔭 Discover — prioritize new artists',
                                value: 'discover',
                            },
                            {
                                name: '🔥 Popular — favour your liked tracks',
                                value: 'popular',
                            },
                        )
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('sertanejo')
                .setDescription('Get or set sertanejo veto for this guild')
                .addBooleanOption((opt) =>
                    opt
                        .setName('block')
                        .setDescription(
                            'Block sertanejo candidates (true) or allow them (false)',
                        )
                        .setRequired(false),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('genre')
                .setDescription('Configure autoplay genres and moods')
                .addSubcommand((sub) =>
                    sub
                        .setName('add')
                        .setDescription('Add a genre to autoplay (max 5)')
                        .addStringOption((opt) =>
                            opt
                                .setName('tag')
                                .setDescription(
                                    'Genre/mood tag (e.g., rock, indie, chillhop)',
                                )
                                .setRequired(true),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a genre from autoplay')
                        .addStringOption((opt) =>
                            opt
                                .setName('tag')
                                .setDescription('Genre/mood tag to remove')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('list')
                        .setDescription('Show all configured autoplay genres'),
                )
                .addSubcommand((sub) =>
                    sub.setName('clear').setDescription('Remove all genres'),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('artist')
                .setDescription('Manage artist preferences for autoplay')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('prefer')
                        .setDescription('Mark an artist as preferred')
                        .addStringOption((opt) =>
                            opt
                                .setName('artist')
                                .setDescription('Artist name')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('block')
                        .setDescription('Block an artist from appearing')
                        .addStringOption((opt) =>
                            opt
                                .setName('artist')
                                .setDescription('Artist name')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('list')
                        .setDescription(
                            'Show your preferred and blocked artists',
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove artist preference')
                        .addStringOption((opt) =>
                            opt
                                .setName('artist')
                                .setDescription('Artist name')
                                .setRequired(true),
                        ),
                ),
        ),
    category: 'music',
    // Autoplay is temporarily unavailable — the recommendation engine
    // (autoplay/queueHandlers.ts, settingsHandlers.ts, artistHandlers.ts) is
    // built around discord-player's GuildQueue/QueueRepeatMode.AUTOPLAY,
    // which the Lavalink migration doesn't have an equivalent for yet. See
    // decisions/2026-06-10-defer-autoplay-engine-extraction.md — this stays
    // deferred to a follow-up rather than silently breaking.
    execute: async ({ interaction }: CommandExecuteParams) => {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        } catch (error) {
            const isUnknownInteraction =
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                (error as { code?: number }).code === 10062
            if (isUnknownInteraction) return
            throw error
        }

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Autoplay temporarily unavailable',
                        'Autoplay is being rebuilt for the new Lavalink-based player and is not available right now.',
                    ),
                ],
                ephemeral: true,
            },
        })
    },
})
