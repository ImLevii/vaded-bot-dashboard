import { errorLog } from '@lucky/shared/utils'

async function main(): Promise<void> {
    const { ensureEnvironment } = await import('@lucky/shared/config')
    await ensureEnvironment()

    const { bootstrapMusicRelay } = await import('./musicRelayBootstrap')
    await bootstrapMusicRelay()
}

main().catch((err: unknown) => {
    errorLog({
        message: 'Failed to start music relay:',
        error: err,
    })
    process.exit(1)
})
