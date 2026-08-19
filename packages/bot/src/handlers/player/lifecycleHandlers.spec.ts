import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'

const debugLogMock = jest.fn()
const infoLogMock = jest.fn()
const restoreSnapshotMock = jest.fn()
const saveSnapshotMock = jest.fn()
const deleteSnapshotMock = jest.fn()
const watchdogArmMock = jest.fn()
const watchdogCheckRecoverMock = jest.fn()
const watchdogClearMock = jest.fn()
const watchdogMarkIntentionalStopMock = jest.fn()
const watchdogIsIntentionalStopMock = jest.fn(() => false)
const replenishQueueMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        restoreSnapshot: (...args: unknown[]) => restoreSnapshotMock(...args),
        saveSnapshot: (...args: unknown[]) => saveSnapshotMock(...args),
        deleteSnapshot: (...args: unknown[]) => deleteSnapshotMock(...args),
    },
}))

jest.mock('../../utils/music/watchdog', () => ({
    musicWatchdogService: {
        arm: (...args: unknown[]) => watchdogArmMock(...args),
        checkAndRecover: (...args: unknown[]) =>
            watchdogCheckRecoverMock(...args),
        clear: (...args: unknown[]) => watchdogClearMock(...args),
        isIntentionalStop: watchdogIsIntentionalStopMock,
        markIntentionalStop: watchdogMarkIntentionalStopMock,
    },
}))

jest.mock('../../utils/music/queueOperations', () => ({
    replenishQueue: (...args: unknown[]) => replenishQueueMock(...args),
}))

import {
    setupLifecycleHandlers,
    setupVoiceKickDetection,
} from './lifecycleHandlers'

type PlayerEventHandler = (queue: GuildQueue, message?: string) => Promise<void>

describe('setupLifecycleHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        restoreSnapshotMock.mockResolvedValue({ restoredCount: 0 })
        saveSnapshotMock.mockResolvedValue(null)
        deleteSnapshotMock.mockResolvedValue(undefined)
        watchdogCheckRecoverMock.mockResolvedValue('none')
        watchdogIsIntentionalStopMock.mockReturnValue(false)
    })

    it('restores snapshot and arms watchdog on connection', async () => {
        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-1', name: 'Guild 1' },
            metadata: { requestedBy: { id: 'user-1' } },
            connection: {
                state: { status: 'ready' },
                joinConfig: {},
            },
        } as unknown as GuildQueue

        await handlers.connection(queue)

        expect(restoreSnapshotMock).toHaveBeenCalledWith(
            queue,
            expect.objectContaining({ id: 'user-1' }),
            expect.objectContaining({ signal: expect.anything() }),
        )
        expect(watchdogArmMock).toHaveBeenCalledWith(queue)
    })

    // watchdog.ts orphan recovery and sessionStartupRestore.ts connect a queue
    // and restore its snapshot themselves (with their own options — e.g.
    // skipCurrentTrack), then this handler also fires on the same connect().
    // Without the flag both restores raced: restoreSnapshot() no-ops once
    // queue.currentTrack is set, so whichever call lost the race silently
    // reported restoredCount: 0 while the winner had already started playback,
    // ignoring the caller's own options entirely.
    it('does not restore when the queue opts out via metadata', async () => {
        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }
        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-1', name: 'Guild 1' },
            metadata: { skipConnectionEventRestore: true },
            connection: { state: { status: 'ready' }, joinConfig: {} },
        } as unknown as GuildQueue

        await handlers.connection(queue)

        expect(restoreSnapshotMock).not.toHaveBeenCalled()
        // The caller still needs stall detection once it's done restoring.
        expect(watchdogArmMock).toHaveBeenCalledWith(queue)
    })

    it('aborts the restore and continues with an empty queue when it exceeds the deadline', async () => {
        jest.useFakeTimers()
        let capturedSignal: AbortSignal | undefined
        // Restore never resolves, so the 2s deadline wins the race.
        restoreSnapshotMock.mockImplementation(
            (_q: unknown, _rb: unknown, opts: unknown) => {
                capturedSignal = (opts as { signal?: AbortSignal })?.signal
                return new Promise<never>(() => {})
            },
        )

        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }
        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-1', name: 'Guild 1' },
            metadata: { requestedBy: { id: 'user-1' } },
            connection: { state: { status: 'ready' }, joinConfig: {} },
        } as unknown as GuildQueue

        const pending = handlers.connection(queue)
        await jest.advanceTimersByTimeAsync(2000)
        await pending

        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Snapshot restore failed, continuing with empty queue',
            }),
        )
        // The hung restore was cancelled so it can't enqueue tracks afterward.
        expect(capturedSignal?.aborted).toBe(true)
        // Service stays armed despite the failed restore.
        expect(watchdogArmMock).toHaveBeenCalledWith(queue)
        jest.useRealTimers()
    })

    it('saves snapshot and triggers recovery on disconnect', async () => {
        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-2', name: 'Guild 2' },
        } as unknown as GuildQueue

        await handlers.disconnect(queue)

        expect(saveSnapshotMock).toHaveBeenCalledWith(queue)
        expect(watchdogCheckRecoverMock).toHaveBeenCalledWith(queue)
    })

    it('does NOT call checkAndRecover when connectionDestroyed', async () => {
        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-3', name: 'Guild 3' },
        } as unknown as GuildQueue

        await handlers.connectionDestroyed(queue)

        expect(saveSnapshotMock).toHaveBeenCalled()
        expect(watchdogCheckRecoverMock).not.toHaveBeenCalled()
    })

    // Saving here was the other half of the reconnect bug: skipping recovery
    // is pointless if the teardown still writes the snapshot that the orphan
    // scan reads a minute later to rebuild the session the user just ended.
    it('does NOT save a snapshot or recover when disconnect is intentional', async () => {
        watchdogIsIntentionalStopMock.mockReturnValue(true)

        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-4', name: 'Guild 4' },
        } as unknown as GuildQueue

        await handlers.disconnect(queue)

        expect(saveSnapshotMock).not.toHaveBeenCalled()
        expect(watchdogCheckRecoverMock).not.toHaveBeenCalled()
    })

    it('does NOT save a snapshot when connectionDestroyed is intentional', async () => {
        watchdogIsIntentionalStopMock.mockReturnValue(true)

        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-5', name: 'Guild 5' },
        } as unknown as GuildQueue

        await handlers.connectionDestroyed(queue)

        expect(saveSnapshotMock).not.toHaveBeenCalled()
    })

    it('replenishes queue on emptyQueue when autoplay is enabled', async () => {
        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const track = { id: 'track-1', title: 'Test' }
        const queue = {
            guild: { id: 'guild-5', name: 'Guild 5' },
            repeatMode: 3,
            currentTrack: track,
        } as unknown as GuildQueue

        await handlers.emptyQueue(queue)

        expect(replenishQueueMock).toHaveBeenCalledWith(queue)
        expect(watchdogMarkIntentionalStopMock).not.toHaveBeenCalled()
    })

    it('marks intentional stop on emptyQueue when autoplay is disabled', async () => {
        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-5', name: 'Guild 5' },
            repeatMode: 2,
            currentTrack: null,
        } as unknown as GuildQueue

        await handlers.emptyQueue(queue)

        expect(watchdogMarkIntentionalStopMock).toHaveBeenCalledWith('guild-5')
        expect(replenishQueueMock).not.toHaveBeenCalled()
    })
})

describe('setupVoiceKickDetection', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('marks intentional stop when bot is kicked from voice channel', async () => {
        const voiceStateUpdateListeners: Array<
            (oldState: any, newState: any) => void
        > = []
        const client = {
            user: { id: 'bot-user-id' },
            on: jest.fn(
                (
                    event: string,
                    handler: (oldState: any, newState: any) => void,
                ) => {
                    if (event === 'voiceStateUpdate') {
                        voiceStateUpdateListeners.push(handler)
                    }
                },
            ),
        }

        setupVoiceKickDetection(client)

        expect(voiceStateUpdateListeners.length).toBe(1)

        const oldState = {
            member: { id: 'bot-user-id' },
            channelId: 'voice-channel-1',
            guild: { id: 'guild-1', name: 'Test Guild' },
        }
        const newState = {
            member: { id: 'bot-user-id' },
            channelId: null,
        }

        await voiceStateUpdateListeners[0](oldState, newState)

        expect(watchdogMarkIntentionalStopMock).toHaveBeenCalledWith('guild-1')
        // connectionDestroyed fires before this event when Discord initiated
        // the disconnect, so it has already written a snapshot while the stop
        // was not yet flagged. Dropping it here is what stops the orphan scan
        // rejoining the channel the bot was just removed from.
        expect(deleteSnapshotMock).toHaveBeenCalledWith('guild-1')
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/disconnected from voice/i),
            }),
        )
    })

    it('ignores voiceStateUpdate for non-bot members', async () => {
        const voiceStateUpdateListeners: Array<
            (oldState: any, newState: any) => void
        > = []
        const client = {
            user: { id: 'bot-user-id' },
            on: jest.fn(
                (
                    event: string,
                    handler: (oldState: any, newState: any) => void,
                ) => {
                    if (event === 'voiceStateUpdate') {
                        voiceStateUpdateListeners.push(handler)
                    }
                },
            ),
        }

        setupVoiceKickDetection(client)

        const oldState = {
            member: { id: 'other-user-id' },
            channelId: 'voice-channel-1',
            guild: { id: 'guild-1', name: 'Test Guild' },
        }
        const newState = {
            member: { id: 'other-user-id' },
            channelId: null,
        }

        await voiceStateUpdateListeners[0](oldState, newState)

        expect(watchdogMarkIntentionalStopMock).not.toHaveBeenCalled()
    })

    it('ignores bot moving between channels (not a disconnect)', async () => {
        const voiceStateUpdateListeners: Array<
            (oldState: any, newState: any) => void
        > = []
        const client = {
            user: { id: 'bot-user-id' },
            on: jest.fn(
                (
                    event: string,
                    handler: (oldState: any, newState: any) => void,
                ) => {
                    if (event === 'voiceStateUpdate') {
                        voiceStateUpdateListeners.push(handler)
                    }
                },
            ),
        }

        setupVoiceKickDetection(client)

        const oldState = {
            member: { id: 'bot-user-id' },
            channelId: 'voice-channel-1',
            guild: { id: 'guild-1', name: 'Test Guild' },
        }
        const newState = {
            member: { id: 'bot-user-id' },
            channelId: 'voice-channel-2',
        }

        await voiceStateUpdateListeners[0](oldState, newState)

        expect(watchdogMarkIntentionalStopMock).not.toHaveBeenCalled()
    })
})
