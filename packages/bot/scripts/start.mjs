import { config as loadEnv } from 'dotenv'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ensureYtDlp } from './ensureYtDlp.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(scriptDir, '..')
const repoRoot = resolve(scriptDir, '../../..')
const tsxCli = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs')
const envPath = resolve(repoRoot, '.env')

loadEnv({ path: envPath })

await ensureYtDlp()

const result = spawnSync('node', [tsxCli, 'src/index.ts'], {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: false,
    env: process.env,
})

if (result.error) {
    throw result.error
}

process.exit(result.status ?? 0)
