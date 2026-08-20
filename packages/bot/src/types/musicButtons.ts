export const MUSIC_BUTTON_IDS = {
    PREVIOUS: 'music_previous',
    PAUSE_RESUME: 'music_pause_resume',
    SKIP: 'music_skip',
    SHUFFLE: 'music_shuffle',
    LOOP: 'music_loop',
    STOP: 'music_stop',
    CLEAR_QUEUE: 'music_clear_queue',
    CLEAR_AUTOPLAY: 'music_clear_autoplay',
    VOLUME_UP: 'music_volume_up',
    VOLUME_DOWN: 'music_volume_down',
    QUEUE: 'music_queue',
} as const

/** Filter picker rendered above the player controls. */
export const MUSIC_FILTER_SELECT_ID = 'music_filter'

export const QUEUE_BUTTON_PREFIX = 'queue_page'
export const LEADERBOARD_BUTTON_PREFIX = 'leaderboard_page'

export type MusicButtonId =
    (typeof MUSIC_BUTTON_IDS)[keyof typeof MUSIC_BUTTON_IDS]
