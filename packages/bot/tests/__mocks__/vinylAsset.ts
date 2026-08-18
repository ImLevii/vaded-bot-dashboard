/**
 * Stands in for src/utils/music/vinylAsset.ts, whose `import.meta.url` is a
 * syntax error under jest's CommonJS transform. Mapped in jest.config.cjs.
 *
 * The path deliberately does not exist, so buildVinylAttachment() takes its
 * existsSync-guarded null branch and no test reads the real 196KB gif.
 */
export const VINYL_GIF_PATH = '/nonexistent/assets/vinyl.gif'
