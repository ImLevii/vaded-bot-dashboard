import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from 'discord.js'
import { RainlinkFilterData } from 'rainlink'
import type { RainlinkQueueAdapter } from './rainlinkAdapter'
import {
    MUSIC_BUTTON_IDS,
    MUSIC_FILTER_SELECT_ID,
    QUEUE_BUTTON_PREFIX,
    LEADERBOARD_BUTTON_PREFIX,
} from '../../types/musicButtons'

// Player controls mirroring =VG=MUSIC-BOT (ByteBlaze)'s
// utilities/PlayerControlButton.ts: a filter picker, then two emoji-only
// Secondary rows — [stop, previous, pause, skip, loop] and
// [shuffle, volume down, clear, volume up, queue].
//
// ByteBlaze renders these with custom emojis (<:pjad_play:1161...>) from its
// own support server. A bot can only use a custom emoji from a guild it is
// actually in, so those ids would render broken here — these are the Unicode
// equivalents. Swap any value below for a '<:name:id>' string to use your own
// custom set.
const PLAYER_EMOJI = {
    stop: '⏹️',
    previous: '⏪',
    pause: '⏸️',
    play: '▶️',
    skip: '⏩',
    loop: '🔁',
    shuffle: '🔀',
    voldown: '🔉',
    volup: '🔊',
    delete: '🗑️',
    queue: '📋',
} as const

/**
 * Audio filter picker. Options come straight from rainlink's own prebuilt
 * filter table, so the list always matches what `player.filter.set()` will
 * actually accept (Lavalink applies these server-side).
 */
export function createMusicFilterSelect(
    disabled = false,
): ActionRowBuilder<StringSelectMenuBuilder> {
    const options = Object.keys(RainlinkFilterData).map((key) => {
        const label = key.charAt(0).toUpperCase() + key.slice(1)
        return new StringSelectMenuOptionBuilder()
            .setLabel(label)
            .setDescription(
                key === 'clear'
                    ? 'Reset all current filters'
                    : `${label} filter for better audio experience!`,
            )
            .setValue(key)
    })

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(MUSIC_FILTER_SELECT_ID)
            .setPlaceholder('Choose a filter for better audio experience')
            // Discord caps a select at 25 options; rainlink ships exactly 25
            // filters today, so slice defensively rather than 400-ing if it
            // ever grows.
            .addOptions(options.slice(0, 25))
            .setDisabled(disabled),
    )
}

export function createMusicControlButtons(
    queue: RainlinkQueueAdapter,
): ActionRowBuilder<ButtonBuilder> {
    const isPaused = queue.node.isPaused()
    const hasHistory = queue.history.tracks.data.length > 0
    const canShuffle = queue.tracks.size >= 2

    const stopButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.STOP)
        .setEmoji(PLAYER_EMOJI.stop)
        .setStyle(ButtonStyle.Secondary)

    const previousButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.PREVIOUS)
        .setEmoji(PLAYER_EMOJI.previous)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasHistory)

    const pauseResumeButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.PAUSE_RESUME)
        .setEmoji(isPaused ? PLAYER_EMOJI.play : PLAYER_EMOJI.pause)
        .setStyle(ButtonStyle.Secondary)

    const skipButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.SKIP)
        .setEmoji(PLAYER_EMOJI.skip)
        .setStyle(ButtonStyle.Secondary)

    const loopButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.LOOP)
        .setEmoji(PLAYER_EMOJI.loop)
        .setStyle(ButtonStyle.Secondary)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        stopButton,
        previousButton,
        pauseResumeButton,
        skipButton,
        loopButton,
    )
}

export function createMusicActionButtons(
    queue: RainlinkQueueAdapter,
): ActionRowBuilder<ButtonBuilder> {
    const canShuffle = queue.tracks.size >= 2

    const shuffleButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
        .setEmoji(PLAYER_EMOJI.shuffle)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canShuffle)

    const volumeDownButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.VOLUME_DOWN)
        .setEmoji(PLAYER_EMOJI.voldown)
        .setStyle(ButtonStyle.Secondary)

    const clearQueueButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.CLEAR_QUEUE)
        .setEmoji(PLAYER_EMOJI.delete)
        .setStyle(ButtonStyle.Secondary)

    const volumeUpButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.VOLUME_UP)
        .setEmoji(PLAYER_EMOJI.volup)
        .setStyle(ButtonStyle.Secondary)

    const queueButton = new ButtonBuilder()
        .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
        .setEmoji(PLAYER_EMOJI.queue)
        .setStyle(ButtonStyle.Secondary)

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        shuffleButton,
        volumeDownButton,
        clearQueueButton,
        volumeUpButton,
        queueButton,
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
