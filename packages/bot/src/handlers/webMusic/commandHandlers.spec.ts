import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    handlePause,
    handleStop,
    handleSkip,
    handlePrevious,
    handlePlay,
} from './commandHandlers'

const publishStateMock = jest.fn()
const buildQueueStateMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const setReplenishSuppressedMock = jest.fn()
const resolveQueryWithFallbacksMock = jest.fn()
const resolveWebPlayContextMock = jest.fn()
const markIntentionalStopMock = jest.fn()
const deleteSnapshotMock = jest.fn<() => Promise<void>>()
const clearSessionMoodCacheMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        publishState: (...args: unknown[]) => publishStateMock(...args),
    },
}))

jest.mock('./mappers', () => ({
    buildQueueState: (...args: unknown[]) => buildQueueStateMock(...args),
    repeatModeToEnum: jest.fn(() => 0),
}))

jest.mock('../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../utils/music/replenishSuppressionStore', () => ({
    setReplenishSuppressed: (...args: unknown[]) =>
        setReplenishSuppressedMock(...args),
}))

jest.mock('../../utils/music/watchdog', () => ({
    musicWatchdogService: {
        markIntentionalStop: (...args: unknown[]) =>
            markIntentionalStopMock(...args),
    },
}))

jest.mock('../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        deleteSnapshot: (...args: unknown[]) => deleteSnapshotMock(...args),
    },
}))

jest.mock('../../utils/music/autoplay/replenisher', () => ({
    clearSessionMoodCache: (...args: unknown[]) =>
        clearSessionMoodCacheMock(...args),
}))

// resolveProvider pulls the shared utils barrel (→ Prisma client, which is
// ESM-only and unparseable under Jest's CJS runtime), so it is stubbed here
// rather than loaded. These handler tests cover the existing-queue paths;
// the cold-start path that uses it is exercised via handlePlay below.
jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: { PLAYER: { CONNECTION_TIMEOUT: 15_000 } },
}))

jest.mock(
    '../../functions/music/commands/play/handlers/resolveProvider',
    () => ({
        resolveQueryWithFallbacks: (...args: unknown[]) =>
            resolveQueryWithFallbacksMock(...args),
    }),
)

jest.mock('./playContext', () => ({
    resolveWebPlayContext: (...args: unknown[]) =>
        resolveWebPlayContextMock(...args),
    buildWebNodeOptions: () => ({ metadata: {} }),
}))

describe('handleStop', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
        deleteSnapshotMock.mockResolvedValue(undefined)
    })

    // A dashboard stop used to skip the teardown that /stop performs, so the
    // watchdog saw an "orphan session" and rejoined, and the surviving
    // snapshot restored the queue that had just been cleared — the user saw
    // "queue cleared" and then 48 tracks still queued a minute later.
    it('marks the stop intentional and drops the session snapshot', async () => {
        const stop = jest.fn()
        const clear = jest.fn()
        const del = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { stop }, clear, delete: del },
        })

        await handleStop(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(markIntentionalStopMock).toHaveBeenCalledWith('guild-1')
        expect(deleteSnapshotMock).toHaveBeenCalledWith('guild-1')
        expect(clearSessionMoodCacheMock).toHaveBeenCalledWith('guild-1')
    })

    it('stops node, clears, and deletes the queue', async () => {
        const stop = jest.fn()
        const clear = jest.fn()
        const del = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { stop }, clear, delete: del },
        })

        const result = await handleStop(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(stop).toHaveBeenCalled()
        expect(clear).toHaveBeenCalled()
        expect(del).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('suppresses autoplay replenish for 30 seconds', async () => {
        const stop = jest.fn()
        const clear = jest.fn()
        const del = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { stop }, clear, delete: del },
        })

        await handleStop(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(setReplenishSuppressedMock).toHaveBeenCalledWith(
            'guild-1',
            30_000,
        )
    })

    it('returns failure when no queue', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        const result = await handleStop(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
    })
})

describe('handleSkip', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('awaits queue.node.skip() before publishing state', async () => {
        const skipAsync = jest.fn().mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { skip: skipAsync } },
        })

        const publishPromise = Promise.resolve()
        publishStateMock.mockReturnValue(publishPromise)

        const result = await handleSkip(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(skipAsync).toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('returns failure when no queue', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        const result = await handleSkip(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
    })
})

describe('webMusic commandHandlers queue resolution', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('uses resolver-backed queue for pause command', async () => {
        const pause = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                node: { pause },
            },
            source: 'cache.guild',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: [],
            },
        })

        const result = await handlePause(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(resolveGuildQueueMock).toHaveBeenCalledWith(
            expect.anything(),
            'guild-1',
        )
        expect(pause).toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalledWith({ guildId: 'guild-1' })
        expect(result.success).toBe(true)
    })

    it('returns failure when resolver misses queue', async () => {
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 0,
                cacheSampleKeys: [],
            },
        })

        const result = await handlePause(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
        expect(publishStateMock).not.toHaveBeenCalled()
    })
})

describe('handlePrevious', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('calls queue.history.previous() when history is not empty', async () => {
        const previousAsync = jest.fn().mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                currentTrack: { title: 'Track' },
                history: {
                    isEmpty: jest.fn().mockReturnValue(false),
                    previous: previousAsync,
                },
            },
        })

        const publishPromise = Promise.resolve()
        publishStateMock.mockReturnValue(publishPromise)

        const result = await handlePrevious(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(previousAsync).toHaveBeenCalledWith(true)
        expect(publishStateMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('calls queue.node.seek(0) when history is empty', async () => {
        const seekAsync = jest.fn().mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                currentTrack: { title: 'Track' },
                history: {
                    isEmpty: jest.fn().mockReturnValue(true),
                    previous: jest.fn(),
                },
                node: { seek: seekAsync },
            },
        })

        const publishPromise = Promise.resolve()
        publishStateMock.mockReturnValue(publishPromise)

        const result = await handlePrevious(
            {} as any,
            { id: 'cmd-3', guildId: 'guild-1', data: {} } as any,
        )

        expect(seekAsync).toHaveBeenCalledWith(0)
        expect(publishStateMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('does not seek when history is empty and no current track', async () => {
        const seekAsync = jest.fn().mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                currentTrack: null,
                history: {
                    isEmpty: jest.fn().mockReturnValue(true),
                    previous: jest.fn(),
                },
                node: { seek: seekAsync },
            },
        })

        const publishPromise = Promise.resolve()
        publishStateMock.mockReturnValue(publishPromise)

        const result = await handlePrevious(
            {} as any,
            { id: 'cmd-4', guildId: 'guild-1', data: {} } as any,
        )

        expect(seekAsync).not.toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('returns failure when no queue', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        const result = await handlePrevious(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
    })
})

describe('handlePlay cold start (no existing queue)', () => {
    const guild = { id: 'guild-1' }
    const client = {
        guilds: { cache: { get: () => guild } },
        player: {},
        users: { fetch: jest.fn() },
    } as any

    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
        // The bug this covers: with no live session the handler used to bail
        // out with "start playing from Discord first" instead of joining.
        resolveGuildQueueMock.mockReturnValue({ queue: null })
    })

    it('joins voice and starts playback instead of refusing', async () => {
        resolveWebPlayContextMock.mockResolvedValue({
            ok: true,
            context: {
                voiceChannel: { id: 'vc-1', members: new Map() },
                textChannel: { id: 'text-1' },
                requestedBy: undefined,
            },
        })
        resolveQueryWithFallbacksMock.mockResolvedValue({
            result: {
                track: { title: 'Song' },
                searchResult: { playlist: null, tracks: [{}] },
            },
        })

        const result = await handlePlay(client, {
            id: 'cmd-1',
            guildId: 'guild-1',
            userId: 'user-1',
            data: { query: 'a song' },
        } as any)

        expect(resolveQueryWithFallbacksMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
        expect(result.data?.title).toBe('Song')
        expect(publishStateMock).toHaveBeenCalled()
    })

    it('surfaces the context error when the user is not in a voice channel', async () => {
        resolveWebPlayContextMock.mockResolvedValue({
            ok: false,
            error: 'Join a voice channel in Discord first, then try again.',
        })

        const result = await handlePlay(client, {
            id: 'cmd-2',
            guildId: 'guild-1',
            userId: 'user-1',
            data: { query: 'a song' },
        } as any)

        expect(result.success).toBe(false)
        expect(result.error).toContain('Join a voice channel')
        expect(resolveQueryWithFallbacksMock).not.toHaveBeenCalled()
    })
})
