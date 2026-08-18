import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Absolute path to the spinning-vinyl gif used as the now-playing thumbnail.
 *
 * Lives in its own module purely so `import.meta` stays out of
 * nowPlayingEmbed.ts: the bot ships as ESM, but jest transforms sources to
 * CommonJS, where `import.meta` is a *syntax* error — it takes down the whole
 * module at parse time, so no amount of lazy evaluation inside a function
 * helps. Keeping it isolated lets jest swap this one file
 * (tests/__mocks__/vinylAsset.ts via moduleNameMapper) and leaves the embed
 * builder directly testable.
 *
 * Five levels up lands on the repo root from both src/utils/music and
 * dist/utils/music, so the same relative path works in dev and in the build.
 */
export const VINYL_GIF_PATH = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../assets/vinyl.gif',
)
