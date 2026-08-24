import type { ButtonInteraction } from 'discord.js'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { levelService } from '@lucky/shared/services'
import { createErrorEmbed } from '../utils/general/embeds'
import { buildListPageEmbed } from '../utils/general/responseEmbeds'
import { createLeaderboardPaginationButtons } from '../utils/general/leaderboardButtons'

export async function handleLeaderboardPage(
    interaction: ButtonInteraction,
): Promise<void> {
    try {
        await interaction.deferUpdate()

        const pageMatch = interaction.customId.match(/leaderboard_page_(\d+)/)
        if (!pageMatch?.[1] || !interaction.guildId) return

        const page = parseInt(pageMatch[1], 10)
        const entries = await levelService.getLeaderboard(
            interaction.guildId,
            50,
        )

        if (entries.length === 0) {
            await interaction.editReply({
                embeds: [
                    createErrorEmbed('Leaderboard', 'No XP recorded yet.'),
                ],
                components: [],
            })
            return
        }

        const listItems = entries.map(
            (e: { userId: string; level: number; xp: number }, i: number) => ({
                name: `#${i + 1}`,
                value: `<@${e.userId}> — Level ${e.level} (${e.xp} XP)`,
            }),
        )

        const itemsPerPage = 5
        const totalPages = Math.ceil(listItems.length / itemsPerPage)

        const embed = buildListPageEmbed(listItems, page + 1, {
            title: 'XP Leaderboard',
            itemsPerPage,
        })

        const components = []
        const paginationRow = createLeaderboardPaginationButtons(
            page,
            totalPages,
        )
        if (paginationRow) {
            components.push(paginationRow)
        }

        await interaction.editReply({
            embeds: [embed],
            components,
        })
        debugLog({ message: `Leaderboard page: ${page}` })
    } catch (error) {
        errorLog({
            message: 'Error handling leaderboard page interaction',
            error,
        })
        await interaction
            .followUp({
                embeds: [createErrorEmbed('Error', 'Something went wrong')],
                ephemeral: true,
            })
            .catch(() => {})
    }
}
