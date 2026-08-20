import { SlashCommandBuilder } from '@discordjs/builders'
import { RainlinkLoopMode } from 'rainlink'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createSuccessEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { requireQueue } from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

/**
 * "Repeat N times" has no rainlink primitive (it only tracks a loop mode,
 * not a remaining-count) — this Map preserves that behavior; trackHandlers.ts
 * decrements it on trackEnd and turns the loop off once it hits zero.
 */
export const guildRepeatCounts = new Map<
    string,
    { count: number; originalMode: RainlinkLoopMode }
>()

function getRepeatModeConfig(
    mode: string,
    times: number | null,
    guildId: string,
): { mode: RainlinkLoopMode; description: string } {
    switch (mode) {
        case 'track': {
            const repeatMode = RainlinkLoopMode.SONG
            if (times !== null && times > 1) {
                guildRepeatCounts.set(guildId, {
                    count: times,
                    originalMode: repeatMode,
                })
                return {
                    mode: repeatMode,
                    description: `Repeating current song **${times} times**`,
                }
            }
            return {
                mode: repeatMode,
                description: 'Repeating current song **infinitely**',
            }
        }
        case 'queue': {
            const repeatMode = RainlinkLoopMode.QUEUE
            if (times !== null && times > 1) {
                guildRepeatCounts.set(guildId, {
                    count: times,
                    originalMode: repeatMode,
                })
                return {
                    mode: repeatMode,
                    description: `Repeating queue **${times} times**`,
                }
            }
            return {
                mode: repeatMode,
                description: 'Repeating queue **infinitely**',
            }
        }
        case 'off':
        default:
            return {
                mode: RainlinkLoopMode.NONE,
                description: 'Repeat **turned off**',
            }
    }
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('🔁 Set the repeat mode with an optional repeat count.')
        .addStringOption((option) =>
            option
                .setName('mode')
                .setDescription('Repeat type')
                .setRequired(true)
                .addChoices(
                    { name: 'off - Turn off', value: 'off' },
                    { name: 'track - Repeat current song', value: 'track' },
                    { name: 'queue - Repeat queue', value: 'queue' },
                ),
        )
        .addIntegerOption((option) =>
            option
                .setName('times')
                .setDescription(
                    'Number of times to repeat (1-100, only for track/queue)',
                )
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        const mode = interaction.options.getString('mode', true)
        const times = interaction.options.getInteger('times', false)

        if (!(await requireQueue(queue, interaction))) return

        const guildId = interaction.guildId ?? ''

        // Clear any existing repeat count
        guildRepeatCounts.delete(guildId)

        const { mode: repeatMode, description } = getRepeatModeConfig(
            mode,
            times,
            guildId,
        )

        queue?.setRepeatMode(repeatMode)

        await interactionReply({
            interaction,
            content: {
                embeds: [createSuccessEmbed('🔁 Repeat mode', description)],
            },
        })
    },
})
