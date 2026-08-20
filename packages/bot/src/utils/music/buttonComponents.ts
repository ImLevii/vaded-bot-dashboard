import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import type { RainlinkQueueAdapter } from './rainlinkAdapter'
import {
    MUSIC_BUTTON_IDS,
    QUEUE_BUTTON_PREFIX,
    LEADERBOARD_BUTTON_PREFIX,
} from '../../types/musicButtons'

// Button row layout/emoji styling modeled after =VG=MUSIC-BOT (ByteBlaze)'s
// utilities/PlayerControlButton.ts — emoji-forward, all Secondary style,
// keeping vaded's existing customId scheme (MUSIC_BUTTON_IDS) unchanged so
// musicButtonHandler.ts's routing doesn't need to change.

export function createMusicControlButtons(
    queue: RainlinkQueueAdapter,
): ActionRowBuilder<ButtonBuilder> {
    const isPaused = queue.node.isPaused()
    const hasHistory = queue.history.tracks.data.length > 0
    const canShuffle = queue.tracks.size >= 2

    const previousButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.PREVIOUS)
        .setEmoji('⏮️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasHistory)

    const pauseResumeButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.PAUSE_RESUME)
        .setEmoji(isPaused ? '▶️' : '⏸️')
        .setStyle(ButtonStyle.Secondary)

    const stopButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.STOP)
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Secondary)

    const skipButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.SKIP)
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Secondary)

    const shuffleButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
        .setEmoji('🔀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canShuffle)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        previousButton,
        pauseResumeButton,
        stopButton,
        skipButton,
        shuffleButton,
    )
}

export function createMusicActionButtons(
    // call-site/signature compatibility; will gate on autoplay state again
    // once the Phase 2 autoplay-on-rainlink follow-up lands.
    _queue: RainlinkQueueAdapter,
): ActionRowBuilder<ButtonBuilder> {
    // No AUTOPLAY loop mode in rainlink — autoplay is deferred (see
    // decisions/2026-06-10-defer-autoplay-engine-extraction.md), so this
    // button stays disabled until that follow-up lands.
    const isAutoplay = false

    const clearQueueButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.CLEAR_QUEUE)
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Secondary)

    const clearAutoplayButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.CLEAR_AUTOPLAY)
        .setEmoji('🤖')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isAutoplay)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        clearQueueButton,
        clearAutoplayButton,
    )
}

export function createQueuePaginationButtons(
    currentPage: number,
    totalPages: number,
): ActionRowBuilder<ButtonBuilder> | null {
    if (totalPages <= 1) {
        return null
    }

    const isFirstPage = currentPage === 0
    const isLastPage = currentPage === totalPages - 1

    const previousButton = new ButtonBuilder()
        .setCustomId(`${QUEUE_BUTTON_PREFIX}_${currentPage - 1}`)
        .setEmoji('◀️')
        .setLabel('Previous Page')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isFirstPage)

    const pageIndicatorButton = new ButtonBuilder()
        .setCustomId('page_indicator')
        .setLabel(`Page ${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)

    const nextButton = new ButtonBuilder()
        .setCustomId(`${QUEUE_BUTTON_PREFIX}_${currentPage + 1}`)
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
