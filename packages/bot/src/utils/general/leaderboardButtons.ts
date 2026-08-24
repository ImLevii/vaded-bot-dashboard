import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { LEADERBOARD_BUTTON_PREFIX } from '../../types/leaderboardButtons'

export function createLeaderboardPaginationButtons(
    currentPage: number,
    totalPages: number,
): ActionRowBuilder<ButtonBuilder> | null {
    if (totalPages <= 1) {
        return null
    }

    const isFirstPage = currentPage === 0
    const isLastPage = currentPage === totalPages - 1

    const previousButton = new ButtonBuilder()
        .setCustomId(`${LEADERBOARD_BUTTON_PREFIX}_${currentPage - 1}`)
        .setEmoji('◀️')
        .setLabel('Previous Page')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isFirstPage)

    const pageIndicatorButton = new ButtonBuilder()
        .setCustomId('leaderboard_page_indicator')
        .setLabel(`Page ${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)

    const nextButton = new ButtonBuilder()
        .setCustomId(`${LEADERBOARD_BUTTON_PREFIX}_${currentPage + 1}`)
        .setEmoji('▶️')
        .setLabel('Next Page')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isLastPage)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        previousButton,
        pageIndicatorButton,
        nextButton,
    )
}
