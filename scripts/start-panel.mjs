/**
 * Startup command for game-panel hosts (e.g. Pterodactyl) that only manage a
 * single process per server. Runs the selected services as sibling children
 * of this one process so all of them are covered by the panel's start/stop
 * controls, without needing a second server/allocation.
 *
 * All knobs are env vars; the defaults preserve the original behavior
 * (bot + music-relay via npm scripts, restart-in-place on child exit):
 *
 *   PANEL_SERVICES        comma list of: bot, backend
 *                         (default "bot")
 *   PANEL_DIST            "true" => run the compiled dist entries directly
 *                         with node (no npm/shell wrapper, so signals and
 *                         kill() actually reach the app). Default "false"
 *                         => legacy npm-script mode.
 *   PANEL_FAIL_FAST       "true" => when ANY child exits, stop the others
 *                         and exit non-zero so the panel restarts the whole
 *                         container. Default "false" => legacy behavior of
 *                         restarting the dead child in-place after 3s.
 *   PANEL_READY_LINE      line printed once every service has logged its
 *                         ready marker (bot: "Logged in as", backend: "Web
 *                         application started on"). A Pterodactyl egg uses
 *                         this as its config.startup.done string.
 *   PANEL_STOP_TIMEOUT_MS grace period to wait for children after SIGTERM
 *                         before exiting anyway (default 8000).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const npmCommand = 'npm'

const useDist = process.env.PANEL_DIST === 'true'
const failFast = process.env.PANEL_FAIL_FAST === 'true'
const readyLine =
    process.env.PANEL_READY_LINE ??
    '[panel] stack online: bot ready and API listening'
const stopTimeoutMs = Number(process.env.PANEL_STOP_TIMEOUT_MS ?? 8000)

const catalog = {
    bot: {
        name: 'bot',
        npmArgs: ['run', 'start', '--workspace=packages/bot'],
        distEntry: 'packages/bot/dist/index.js',
        readyMarker: 'Logged in as ',
    },
    backend: {
        name: 'backend',
        npmArgs: ['run', 'start', '--workspace=packages/backend'],
        distEntry: 'packages/backend/dist/index.js',
        readyMarker: 'Web application started on ',
    },
}

const requested = (process.env.PANEL_SERVICES ?? 'bot')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)

const services = requested.map((key) => {
    const entry = catalog[key]
    if (!entry) {
        console.error(
            `[panel] unknown service "${key}" in PANEL_SERVICES (valid: ${Object.keys(catalog).join(', ')})`,
        )
        process.exit(1)
    }
    return {
        ...entry,
        ready: entry.readyMarker === null,
        // Rolling tail so a ready marker split across stream chunks still
        // matches.
        tail: '',
        process: null,
    }
})

if (services.length === 0) {
    console.error('[panel] PANEL_SERVICES resolved to an empty service list')
    process.exit(1)
}

if (useDist) {
    for (const service of services) {
        if (!existsSync(resolve(projectRoot, service.distEntry))) {
            console.error(
                `[panel] missing build output for "${service.name}": ${service.distEntry}. ` +
                    'Run the build (npm run build:shared && npm run build --workspace=packages/bot ' +
                    '&& npm run build --workspace=packages/backend) or reinstall the server.',
            )
            process.exit(1)
        }
    }
}

let shuttingDown = false
let readyAnnounced = false

function announceReadyIfComplete() {
    if (readyAnnounced) return
    if (!services.every((service) => service.ready)) return
    readyAnnounced = true
    console.log(readyLine)
}

function scanForReadyMarker(service, chunk) {
    if (service.ready || !service.readyMarker) return
    const text = service.tail + chunk.toString('utf8')
    if (text.includes(service.readyMarker)) {
        service.ready = true
        announceReadyIfComplete()
        return
    }
    service.tail = text.slice(-service.readyMarker.length * 2)
}

function forwardOutput(service, child) {
    const pairs = [
        [child.stdout, process.stdout],
        [child.stderr, process.stderr],
    ]
    for (const [source, sink] of pairs) {
        if (!source) continue
        source.on('data', (chunk) => {
            sink.write(chunk)
            scanForReadyMarker(service, chunk)
        })
    }
}

function isAlive(service) {
    return (
        service.process !== null &&
        service.process.exitCode === null &&
        service.process.signalCode === null
    )
}

function terminateChildren() {
    for (const service of services) {
        if (isAlive(service)) {
            service.process.kill('SIGTERM')
        }
    }
}

function exitWhenChildrenDone(exitCode) {
    const deadline = Date.now() + stopTimeoutMs
    const poll = setInterval(() => {
        if (!services.some(isAlive) || Date.now() > deadline) {
            clearInterval(poll)
            process.exit(exitCode)
        }
    }, 100)
}

function failStack(exitCode, reason) {
    if (shuttingDown) return
    shuttingDown = true
    console.error(
        `[panel] ${reason} — stopping the remaining services and exiting ${exitCode} so the panel restarts the whole stack.`,
    )
    terminateChildren()
    exitWhenChildrenDone(exitCode)
}

function spawnService(service) {
    const child = useDist
        ? spawn(process.execPath, [service.distEntry], {
              cwd: projectRoot,
              env: process.env,
              shell: false,
              stdio: ['inherit', 'pipe', 'pipe'],
          })
        : spawn(npmCommand, service.npmArgs, {
              cwd: projectRoot,
              env: process.env,
              shell: true,
              stdio: ['inherit', 'pipe', 'pipe'],
          })

    forwardOutput(service, child)

    child.on('error', (error) => {
        console.error(`[panel] ${service.name} error:`, error.message)
        if (failFast) {
            failStack(1, `${service.name} failed to start`)
        }
    })

    child.on('exit', (code, signal) => {
        if (shuttingDown) return
        const label = signal ?? `code ${code ?? 0}`
        if (failFast) {
            const exitCode = code === null || code === 0 ? 1 : code
            failStack(exitCode, `${service.name} exited (${label})`)
            return
        }
        console.error(
            `[panel] ${service.name} exited (${label}), restarting in 3s...`,
        )
        setTimeout(() => {
            service.process = spawnService(service)
        }, 3000)
    })

    return child
}

// Hosts that use this launcher (Pterodactyl et al.) have no yt-dlp on PATH.
// The egg's install.sh downloads a static build into .bin/, but that download
// is non-fatal when it fails, and an AUTO_UPDATE rebuild never re-provisions
// it — so the stack can come up without one. The bot then spawns `yt-dlp` per
// track, gets ENOENT, and silently degrades to the SoundCloud bridge (which
// fails outright for anything SoundCloud has no match for). The dev launcher
// (packages/bot/scripts/start.mjs) already self-heals this; do the same here so
// it doesn't depend on which entry point started the bot. Children are spawned
// with `env: process.env`, so the YT_DLP_PATH set below reaches them.
try {
    const { ensureYtDlp } = await import(
        '../packages/bot/scripts/ensureYtDlp.mjs'
    )
    await ensureYtDlp()
} catch (error) {
    // Never block startup on this: everything but yt-dlp-backed sources works.
    // Also covers images that ship dist without packages/bot/scripts.
    console.error(
        '[panel] yt-dlp provisioning skipped:',
        error instanceof Error ? error.message : error,
    )
}

for (const service of services) {
    service.process = spawnService(service)
}
announceReadyIfComplete()

function stopAll(exitCode) {
    if (shuttingDown) return
    shuttingDown = true
    terminateChildren()
    exitWhenChildrenDone(exitCode)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
