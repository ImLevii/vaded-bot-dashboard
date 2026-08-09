// Removed unused import

// Color constants for different types of messages
export const EMBED_COLORS = {
    SUCCESS: '#4CAF50', // Green
    ERROR: '#F44336', // Red
    INFO: '#2196F3', // Blue
    WARNING: '#FFC107', // Amber
    NEUTRAL: '#9E9E9E', // Grey
    MUSIC: '#000000', // Black
    QUEUE: '#111111', // Near-black
    AUTOPLAY: '#dc2626', // Brand red
} as const

// Emoji constants for different types of messages
export const EMOJIS = {
    SUCCESS: '✅',
    ERROR: '❌',
    INFO: 'ℹ️',
    WARNING: '⚠️',
    NEUTRAL: '⚪',
    MUSIC: '<a:music:741605543046807626>',
    AUDIO: '🎧',
    VIDEO: '🎥',
    QUEUE: '📋',
    AUTOPLAY: '🔄',
    PLAY: '▶️',
    PAUSE: '⏸️',
    STOP: '⏹️',
    SKIP: '⏭️',
    VOLUME: '🔊',
    LOOP: '🔁',
    SHUFFLE: '🔀',
    DOWNLOAD: '⬇️',
    SETTINGS: '⚙️',
    EXIT: '🚪',
} as const

/** Type representing a valid embed color from EMBED_COLORS constants. */
export type EmbedColor = (typeof EMBED_COLORS)[keyof typeof EMBED_COLORS]

/** Type representing a valid emoji from EMOJIS constants. */
export type EmbedEmoji = (typeof EMOJIS)[keyof typeof EMOJIS]
