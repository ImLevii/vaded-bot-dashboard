import { errorLog } from '@lucky/shared/utils'

async function main(): Promise<void> {
    const { ensureEnvironment } = await import('@lucky/shared/config')
    await ensureEnvironment()

    const { bootstrapBackend } = await import('./bootstrap')
    await bootstrapBackend()
}

main().catch((err: unknown) => {
    errorLog({
        message: 'Failed to start backend:',
        error: err,
    })
    process.exit(1)
})
