import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { Collection } from 'discord.js'

const listCommands = jest.fn<(guildId: string) => Promise<unknown[]>>()

jest.mock('@lucky/shared/services', () => ({
    customCommandService: {
        listCommands: (guildId: string) => listCommands(guildId),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    config: () => ({ TOKEN: 'token', CLIENT_ID: 'client-1' }),
}))

import { syncGuildCustomCommands } from './registration'
import type { CustomClient } from '../../types'

function makeClient(builtinNames: string[] = []): CustomClient {
    const commands = new Collection<string, { data: { name: string } }>()
    for (const name of builtinNames) {
        commands.set(name, { data: { name } })
    }
    return { commands } as unknown as CustomClient
}

describe('syncGuildCustomCommands', () => {
    let put: jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()
        put = jest.fn(async () => undefined)
    })

    it('registers enabled commands as guild-scoped slash commands', async () => {
        listCommands.mockResolvedValue([
            { name: 'gg', description: 'good game', enabled: true },
            { name: 'clip', description: null, enabled: true },
        ])

        const result = await syncGuildCustomCommands(makeClient(), 'guild-1', {
            rest: { put } as never,
        })

        expect(result.registered).toEqual(['gg', 'clip'])
        const [route, payload] = put.mock.calls[0] as [
            string,
            { body: { name: string; description: string }[] },
        ]
        expect(route).toContain('guild-1')
        expect(payload.body).toHaveLength(2)
        expect(payload.body[0]).toMatchObject({
            name: 'gg',
            description: 'good game',
        })
        // Discord rejects an empty description, but the column is nullable.
        expect(payload.body[1].description).toBe('Custom command: clip')
    })

    // Guild and global commands are merged by Discord. Including the global
    // set here would write duplicate guild copies of every built-in — the
    // mess `commands:clear-guild` exists to undo (#1886).
    it('sends only custom commands, never the built-ins', async () => {
        listCommands.mockResolvedValue([
            { name: 'gg', description: 'good game', enabled: true },
        ])

        await syncGuildCustomCommands(
            makeClient(['play', 'skip', 'level']),
            'guild-1',
            { rest: { put } as never },
        )

        const [, payload] = put.mock.calls[0] as [
            string,
            { body: { name: string }[] },
        ]
        expect(payload.body.map((c) => c.name)).toEqual(['gg'])
    })

    it('skips disabled, invalid-name, and built-in-shadowing commands', async () => {
        listCommands.mockResolvedValue([
            { name: 'ok', description: 'd', enabled: true },
            { name: 'off', description: 'd', enabled: false },
            { name: 'Bad Name', description: 'd', enabled: true },
            { name: 'play', description: 'd', enabled: true },
        ])

        const result = await syncGuildCustomCommands(
            makeClient(['play']),
            'guild-1',
            { rest: { put } as never },
        )

        expect(result.registered).toEqual(['ok'])
        expect(result.skipped).toEqual([
            { name: 'off', reason: 'disabled' },
            {
                name: 'Bad Name',
                reason: 'name not valid for a Discord slash command',
            },
            { name: 'play', reason: 'shadows a built-in command' },
        ])
    })

    it('clears the guild set when no commands remain', async () => {
        listCommands.mockResolvedValue([])

        await syncGuildCustomCommands(makeClient(), 'guild-1', {
            rest: { put } as never,
        })

        const [, payload] = put.mock.calls[0] as [string, { body: unknown[] }]
        expect(payload.body).toEqual([])
    })

    // A Discord outage must not take down the refresh listener.
    it('swallows REST failures', async () => {
        listCommands.mockResolvedValue([
            { name: 'gg', description: 'd', enabled: true },
        ])
        put.mockRejectedValue(new Error('discord down'))

        await expect(
            syncGuildCustomCommands(makeClient(), 'guild-1', {
                rest: { put } as never,
            }),
        ).resolves.toBeDefined()
    })
})
