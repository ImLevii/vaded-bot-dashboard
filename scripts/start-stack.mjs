import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { config as loadEnv } from 'dotenv'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const npmCommand = 'npm'

process.chdir(projectRoot)
loadEnv({ path: resolve(projectRoot, '.env'), override: true })

function canRun(command, args) {
    const result = spawnSync(command, args, {
        stdio: 'ignore',
        shell: false,
    })

    return !result.error && result.status === 0
}

function runCompose(command, args) {
    const result = spawnSync(command, args, {
        stdio: 'inherit',
        shell: false,
    })

    if (result.error) {
        if (result.error.code === 'ENOENT') {
            return null
        }
        throw result.error
    }

    return result.status ?? 0
}

function startLocalStack() {
    const services = [
        { args: ['run', 'dev:bot'], name: 'bot' },
        { args: ['run', 'dev:backend'], name: 'backend' },
        { args: ['run', 'dev:frontend'], name: 'frontend' },
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
            console.error(`[stack] ${service.name} error:`, error.message)
            if (!shuttingDown) {
                console.error(`[stack] restarting ${service.name} in 3s...`)
                setTimeout(() => { service.process = spawnService(service) }, 3000)
            }
        })

        child.on('exit', (code, signal) => {
            if (shuttingDown) return
            const label = signal ?? `code ${code ?? 0}`
            console.error(`[stack] ${service.name} exited (${label}), restarting in 3s...`)
            setTimeout(() => { service.process = spawnService(service) }, 3000)
        })

        return child
    }

    for (const service of services) {
        service.process = spawnService(service)
    }

    const stopAll = (exitCode) => {
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
}

function startStack() {
    if (!canRun('docker', ['compose', 'version'])) {
        console.error(
            'Docker Compose was not found. Starting local bot/backend/frontend dev servers instead.',
        )
        startLocalStack()
        return
    }

    process.exit(runCompose('docker', ['compose', 'up', '-d']))
}

startStack()
