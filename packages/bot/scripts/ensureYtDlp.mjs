/**
 * Self-heals a missing yt-dlp binary on hosts that don't have one on PATH
 * (e.g. Pterodactyl's generic nodejs egg, which has no Python/yt-dlp baked
 * in, unlike this project's own Docker image). Downloads yt-dlp's
 * standalone release binary once into a persisted local cache dir and
 * points YT_DLP_PATH at it so streamBridge.ts's resolveYtDlpExecutable()
 * picks it up without any further configuration.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, rename } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')

function releaseAssetName() {
    if (process.platform === 'win32') return 'yt-dlp.exe'
    if (process.platform === 'darwin') return 'yt-dlp_macos'
    if (process.platform === 'linux') {
        return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'
    }
    return null
}

function isOnPath() {
    const result = spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' })
    return !result.error
}

export async function ensureYtDlp() {
    if (process.env.YT_DLP_PATH?.trim()) return
    if (isOnPath()) return

    const assetName = releaseAssetName()
    if (!assetName) return

    const targetPath = join(
        repoRoot,
        '.bin',
        assetName === 'yt-dlp.exe' ? 'yt-dlp.exe' : 'yt-dlp',
    )

    if (existsSync(targetPath)) {
        process.env.YT_DLP_PATH = targetPath
        return
    }

    try {
        await mkdir(dirname(targetPath), { recursive: true })
        const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`
        const response = await fetch(url, { redirect: 'follow' })
        if (!response.ok || !response.body) {
            throw new Error(`unexpected response ${response.status}`)
        }
        const tmpPath = `${targetPath}.download`
        await pipeline(Readable.fromWeb(response.body), createWriteStream(tmpPath))
        await chmod(tmpPath, 0o755)
        await rename(tmpPath, targetPath)
        process.env.YT_DLP_PATH = targetPath
        console.log(`[ensureYtDlp] downloaded yt-dlp to ${targetPath}`)
    } catch (error) {
        console.error(
            '[ensureYtDlp] failed to download yt-dlp, YouTube playback will fail until yt-dlp is on PATH or YT_DLP_PATH is set:',
            error instanceof Error ? error.message : error,
        )
    }
}
