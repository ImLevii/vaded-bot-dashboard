jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        isHealthy: jest.fn().mockReturnValue(false),
        keys: jest.fn().mockResolvedValue([]),
    },
}))

jest.mock('../../../src/utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        getSnapshot: jest.fn(),
        restoreSnapshot: jest.fn(),
        saveSnapshot: jest.fn(),
        deleteSnapshot: jest.fn(),
    },
}))

import { MusicWatchdogService } from '../../../src/utils/music/watchdog'

function makeQueue(
    overrides: Partial<{
        guildId: string
        isPlaying: boolean
        isPaused: boolean
        connectionStatus: string
        currentTrack: unknown
        tracksSize: number
    }> = {},
): any {
    const opts = {
        guildId: 'guild-1',
        isPlaying: false,
        // A paused queue is not a stalled one — the watchdog leaves it alone.
        isPaused: false,
        connectionStatus: 'ready',
        currentTrack: null,
        tracksSize: 0,
        ...overrides,
    }
    return {
        guild: { id: opts.guildId, name: 'Test Guild' },
        node: {
            isPlaying: jest.fn().mockReturnValue(opts.isPlaying),
            isPaused: jest.fn().mockReturnValue(opts.isPaused),
            play: jest.fn().mockResolvedValue(undefined),
        },
        connection: {
            state: { status: opts.connectionStatus },
            rejoin: jest.fn(),
        },
        currentTrack: opts.currentTrack,
        tracks: { size: opts.tracksSize },
    }
}

describe('MusicWatchdogService', () => {
    let service: MusicWatchdogService

    beforeEach(() => {
        jest.useFakeTimers()
        service = new MusicWatchdogService({ timeoutMs: 100 })
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('markIntentionalStop', () => {
        it('causes checkAndRecover to return none without attempting recovery', async () => {
            const queue = makeQueue()
            service.markIntentionalStop('guild-1')

            const result = await service.checkAndRecover(queue)

            expect(result).toBe('none')
            expect(queue.node.play).not.toHaveBeenCalled()
            expect(queue.connection.rejoin).not.toHaveBeenCalled()
        })

        it('clears any active watchdog timer', () => {
            const queue = makeQueue()
            service.arm(queue)
            expect(service['timers'].has('guild-1')).toBe(true)

            service.markIntentionalStop('guild-1')
            expect(service['timers'].has('guild-1')).toBe(false)
        })

        it('removes the intentional stop flag after timeoutMs + 10s', async () => {
            service.markIntentionalStop('guild-1')

            // Flag must persist through the watchdog timeout window
            jest.advanceTimersByTime(100 + 9_999)
            expect(service['intentionalStops'].has('guild-1')).toBe(true)

            // Clears after timeoutMs (100) + 10_000
            jest.advanceTimersByTime(1)
            expect(service['intentionalStops'].has('guild-1')).toBe(false)
        })

        it('does not block recovery for a different guild', async () => {
            const queue2 = makeQueue({ guildId: 'guild-2', isPlaying: true })
            service.markIntentionalStop('guild-1')

            const result = await service.checkAndRecover(queue2)
            expect(result).toBe('none')
            expect(queue2.node.isPlaying).toHaveBeenCalled()
        })
    })

    describe('checkAndRecover', () => {
        it('returns none when queue is playing', async () => {
            const queue = makeQueue({ isPlaying: true })
            const result = await service.checkAndRecover(queue)
            expect(result).toBe('none')
        })

        it('requeues current track when connection is ready and track exists', async () => {
            const currentTrack = { title: 'Song' }
            const queue = makeQueue({ currentTrack })
            const result = await service.checkAndRecover(queue)
            expect(result).toBe('requeue_current')
            // Explicit track: a bare play() dispatches from the (empty) track
            // list and answers with NoResultError instead of resuming.
            expect(queue.node.play).toHaveBeenCalledWith(currentTrack, {
                queue: false,
            })
        })

        it('leaves a paused queue alone', async () => {
            const queue = makeQueue({
                isPaused: true,
                currentTrack: { title: 'Song' },
            })
            const result = await service.checkAndRecover(queue)
            expect(result).toBe('none')
            expect(queue.node.play).not.toHaveBeenCalled()
        })
    })

    describe('isIntentionalStop', () => {
        it('returns true after markIntentionalStop is called', () => {
            service.markIntentionalStop('guild-1')
            expect(service['intentionalStops'].has('guild-1')).toBe(true)
        })

        it('returns false before markIntentionalStop is called', () => {
            expect(service['intentionalStops'].has('guild-new')).toBe(false)
        })

        it('returns false for a different guild after markIntentionalStop', () => {
            service.markIntentionalStop('guild-1')
            expect(service['intentionalStops'].has('guild-1')).toBe(true)
            expect(service['intentionalStops'].has('guild-2')).toBe(false)
        })
    })
})
