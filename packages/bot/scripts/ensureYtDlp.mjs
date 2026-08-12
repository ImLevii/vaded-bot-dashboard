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
import { chmod, mkdir, rename, unlink } from 'node:fs/promises'
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

/**
 * A yt-dlp that spawns but exits non-zero is worse than a missing one: the
 * standalone release is a PyInstaller one-file bundle, so a truncated
 * download — or a host that can't unpack it (no space in TMPDIR) — still
 * produces a runnable-looking file that fails every extraction with
 * `PYI-*: Failed to extract ...`. Checking only `!result.error` (i.e. "did
 * spawn work") treats those as healthy forever, so verify the exit status.
 */
function runsSuccessfully(command) {
    const result = spawnSync(command, ['--version'], { stdio: 'ignore' })
    return !result.error && result.status === 0
}

function isOnPath() {
    return runsSuccessfully('yt-dlp')
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
        if (runsSuccessfully(targetPath)) {
            process.env.YT_DLP_PATH = targetPath
            return
        }
        // Cached copy is corrupt/unusable — drop it and re-download below
        // rather than pointing the bridge at a binary that fails every call.
        console.warn(
            `[ensureYtDlp] cached yt-dlp at ${targetPath} failed --version, re-downloading`,
        )
        try {
            await unlink(targetPath)
        } catch {
            // fall through — the download below overwrites via rename anyway
        }
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

        // A freshly-downloaded binary that still can't run points at the
        // host, not the download — most often no space left for the
        // PyInstaller bundle to unpack into TMPDIR. Say so explicitly;
        // otherwise this surfaces later as an opaque per-track failure.
        if (!runsSuccessfully(targetPath)) {
            console.error(
                '[ensureYtDlp] freshly downloaded yt-dlp still fails --version. ' +
                    'This usually means the host cannot unpack it (e.g. no free disk ' +
                    `space for TMPDIR=${process.env.TMPDIR ?? '/tmp'}). YouTube playback will fail until resolved.`,
            )
        }
    } catch (error) {
        console.error(
            '[ensureYtDlp] failed to download yt-dlp, YouTube playback will fail until yt-dlp is on PATH or YT_DLP_PATH is set:',
            error instanceof Error ? error.message : error,
        )
    }
}
