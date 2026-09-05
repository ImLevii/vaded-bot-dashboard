import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const botDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const requiredFiles = ['app.yml', 'package.json', 'package-lock.json', 'dist/index.js']
const corePackages = ['discord.js', 'rainlink', 'fastify']

export function startupConfiguration(env, nodeVersion = process.versions.node) {
  if (Number(nodeVersion.split('.')[0]) !== 24) {
    throw new Error('Select the Node.js 24 image in Pterodactyl before starting this bot.')
  }
  const value = env.SERVER_PORT?.trim()
  if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('SERVER_PORT must be the primary Pterodactyl allocation port (1-65535).')
  }
  const token = env.VG_MUSIC_BOT_TOKEN
  if (
    !token?.trim() ||
    /^(undefined|null|youshallnotpass)$/i.test(token.trim()) ||
    /[\r\n]/.test(token) ||
    /\$\{[^}]+\}/.test(token)
  ) {
    throw new Error('Set VG_MUSIC_BOT_TOKEN to the shared API token used by the Vercel backend.')
  }
  return {
    ...env,
    NODE_ENV: 'production',
    VG_MUSIC_BOT_TOKEN: token.trim(),
    VG_MUSIC_BOT_PORT: String(Number(value)),
    VG_MUSIC_BOT_HOST: '0.0.0.0',
  }
}

export function validateRuntimeFiles(directory, fileExists = existsSync) {
  for (const file of requiredFiles) {
    if (!fileExists(resolve(directory, file))) {
      throw new Error(
        `Missing ${file}. Upload the prebuilt vg-music-bot package and retain your existing app.yml, .env, and data directory.`
      )
    }
  }
}

export function dependencyStamp(
  lockContents,
  platform = process.platform,
  arch = process.arch,
  nodeVersion = process.versions.node
) {
  return createHash('sha256')
    .update(lockContents)
    .update(`\n${platform}/${arch}/${nodeVersion.split('.')[0]}`)
    .digest('hex')
}

function runChild(command, args, env) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, { cwd: botDirectory, env, stdio: 'inherit' })
    const onInterrupt = () => child.kill('SIGINT')
    const onTerminate = () => child.kill('SIGTERM')
    const cleanup = () => {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
    }
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    child.once('error', (error) => {
      cleanup()
      reject(error)
    })
    child.once('exit', (code, signal) => {
      cleanup()
      resolveExit(code ?? (signal === 'SIGINT' ? 130 : 143))
    })
  })
}

async function main() {
  // Panel variables retain precedence over the existing private .env file.
  const envFile = resolve(botDirectory, '.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const env = startupConfiguration(process.env)
  validateRuntimeFiles(botDirectory)

  const lock = readFileSync(resolve(botDirectory, 'package-lock.json'), 'utf8')
  const expectedStamp = dependencyStamp(lock)
  const stampFile = resolve(botDirectory, 'node_modules/.vg-music-bot-pterodactyl')
  const installedStamp = existsSync(stampFile) ? readFileSync(stampFile, 'utf8').trim() : ''
  const requireFromBot = createRequire(resolve(botDirectory, 'package.json'))
  const packagesPresent = corePackages.every((name) => {
    try {
      requireFromBot.resolve(name)
      return true
    } catch {
      return false
    }
  })

  if (installedStamp !== expectedStamp || !packagesPresent) {
    console.log(
      '[music-bot] Installing locked production dependencies; runtime configuration and data are preserved.'
    )
    const exitCode = await runChild('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], env)
    if (exitCode !== 0) return exitCode
    writeFileSync(stampFile, expectedStamp)
  }

  console.log(`[music-bot] Starting vg-music-bot API on 0.0.0.0:${env.VG_MUSIC_BOT_PORT}`)
  return runChild(process.execPath, ['--no-deprecation', './dist/index.js'], env)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code
    },
    (error) => {
      console.error('[music-bot]', error instanceof Error ? error.message : 'Startup failed.')
      process.exitCode = 1
    }
  )
}
