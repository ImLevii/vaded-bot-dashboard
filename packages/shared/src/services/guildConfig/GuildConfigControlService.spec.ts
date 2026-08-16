import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('../../utils/general/log.js', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('../../utils/monitoring/sentry.js', () => ({
    captureMessageThrottled: jest.fn(),
}))

jest.mock('ioredis', () => ({
    __esModule: true,
    default: jest.fn(),
}))

jest.mock('../redis/config.js', () => ({
    createRedisConfig: jest.fn(() => ({})),
}))

import RedisClientClass from 'ioredis'
import {
    GuildConfigControlService,
    CHANNEL_GUILD_CONFIG_REFRESH,
    type GuildConfigRefresh,
} from './GuildConfigControlService.js'
import { captureMessageThrottled } from '../../utils/monitoring/sentry.js'

type MessageListener = (channel: string, raw: string) => void

function makeClient(status = 'ready') {
    const listeners: MessageListener[] = []
    return {
        status,
        publish: jest.fn(async (_channel: string, _payload: string) => 1),
        subscribe: jest.fn(async (_channel: string) => undefined),
        unsubscribe: jest.fn(async () => undefined),
        connect: jest.fn(async () => undefined),
        disconnect: jest.fn(async () => undefined),
        on: jest.fn((event: string, handler: MessageListener) => {
            if (event === 'message') listeners.push(handler)
        }),
        emitMessage: (channel: string, raw: string) => {
            for (const l of listeners) l(channel, raw)
        },
    }
}

describe('GuildConfigControlService', () => {
    let publisher: ReturnType<typeof makeClient>
    let subscriber: ReturnType<typeof makeClient>
    let service: GuildConfigControlService

    beforeEach(async () => {
        jest.clearAllMocks()
        publisher = makeClient()
        subscriber = makeClient()
        const ctor = RedisClientClass as unknown as jest.Mock
        ctor.mockReset()
        ctor.mockImplementationOnce(() => publisher).mockImplementationOnce(
            () => subscriber,
        )
        service = new GuildConfigControlService()
        await service.connect()
    })

    it('publishes a scoped refresh for one guild', async () => {
        await service.publishRefresh('automod', 'guild-1')

        expect(publisher.publish).toHaveBeenCalledWith(
            CHANNEL_GUILD_CONFIG_REFRESH,
            JSON.stringify({ scope: 'automod', guildId: 'guild-1' }),
        )
    })

    // A dashboard save must never fail because Redis is unavailable: the write
    // already landed in Postgres and the bot picks it up on cache expiry.
    it('skips publishing when the publisher is not ready', async () => {
        publisher.status = 'connecting'

        await expect(
            service.publishRefresh('automod', 'guild-1'),
        ).resolves.toBeUndefined()

        expect(publisher.publish).not.toHaveBeenCalled()
        expect(captureMessageThrottled).toHaveBeenCalled()
    })

    it('delivers parsed refreshes to the handler', async () => {
        const received: GuildConfigRefresh[] = []
        await service.subscribeToRefresh(async (refresh) => {
            received.push(refresh)
        })

        subscriber.emitMessage(
            CHANNEL_GUILD_CONFIG_REFRESH,
            JSON.stringify({ scope: 'customCommands', guildId: 'guild-9' }),
        )

        expect(received).toEqual([
            { scope: 'customCommands', guildId: 'guild-9' },
        ])
    })

    it('ignores malformed payloads and unknown scopes', async () => {
        const handler = jest.fn(async () => undefined)
        await service.subscribeToRefresh(handler)

        subscriber.emitMessage(CHANNEL_GUILD_CONFIG_REFRESH, 'not json')
        subscriber.emitMessage(CHANNEL_GUILD_CONFIG_REFRESH, '{}')
        subscriber.emitMessage(
            CHANNEL_GUILD_CONFIG_REFRESH,
            JSON.stringify({ scope: 'nope', guildId: 'guild-1' }),
        )

        expect(handler).not.toHaveBeenCalled()
    })

    // One failing handler must not tear down the subscriber for every other
    // guild and scope.
    it('swallows handler errors', async () => {
        const handler = jest
            .fn<() => Promise<void>>()
            .mockRejectedValue(new Error('boom'))
        await service.subscribeToRefresh(handler)

        expect(() =>
            subscriber.emitMessage(
                CHANNEL_GUILD_CONFIG_REFRESH,
                JSON.stringify({ scope: 'levels', guildId: 'guild-1' }),
            ),
        ).not.toThrow()
    })
})
