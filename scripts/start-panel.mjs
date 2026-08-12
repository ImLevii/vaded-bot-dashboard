/**
 * Startup command for game-panel hosts (e.g. Pterodactyl) that only manage a
 * single process per server. Runs the bot and the music relay as sibling
 * children of this one process so both are covered by the panel's start/stop
 * controls, without needing a second server/allocation.
 */
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const npmCommand = 'npm'

const services = [
    { args: ['run', 'start', '--workspace=packages/bot'], name: 'bot' },
    { args: ['run', 'start:music-relay:tsx', '--workspace=packages/backend'], name: 'music-relay' },
]

let shuttingDown = false

function spawnService(service) {
    const child = spawn(npmCommand, service.args, {
        cwd: projectRoot,
        env: process.env,
        shell: true,
        stdio: 'inherit',
    })

    child.on('error', (error) => {
        console.error(`[panel] ${service.name} error:`, error.message)
    })

    child.on('exit', (code, signal) => {
        if (shuttingDown) return
        const label = signal ?? `code ${code ?? 0}`
        console.error(`[panel] ${service.name} exited (${label}), restarting in 3s...`)
        setTimeout(() => {
            service.process = spawnService(service)
        }, 3000)
    })

    return child
}

for (const service of services) {
    service.process = spawnService(service)
}

function stopAll(exitCode) {
    if (shuttingDown) return
    shuttingDown = true
    for (const service of services) {
        if (service.process && !service.process.killed) {
            service.process.kill('SIGTERM')
        }
    }
    setTimeout(() => process.exit(exitCode), 250)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
