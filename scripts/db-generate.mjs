import { spawnSync } from 'node:child_process'

const env = {
    ...process.env,
    DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres',
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const result = spawnSync(
    npmCmd,
    ['exec', '--', 'prisma', 'generate', '--config', 'prisma/prisma.config.ts'],
    {
        stdio: 'inherit',
        shell: true,
        env,
    },
)

if (result.error) {
    throw result.error
}

process.exit(result.status ?? 1)
