import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const getCommand = jest.fn<(g: string, n: string) => Promise<unknown>>()
const canUseCommand = jest.fn<() => boolean>()
const incrementUsage = jest.fn<() => Promise<void>>()

jest.mock('@lucky/shared/services', () => ({
    customCommandService: {
        getCommand: (g: string, n: string) => getCommand(g, n),
        canUseCommand: (...args: unknown[]) => canUseCommand(...(args as [])),
        incrementUsage: () => incrementUsage(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

import { executeCustomCommand } from './execute'
import type { ChatInputCommandInteraction } from 'discord.js'

function makeInteraction(commandName: string) {
    return {
        commandName,
        guildId: 'guild-1',
        channelId: 'chan-1',
        user: { id: 'user-1', username: 'ada' },
        member: {
            displayName: 'Ada',
            roles: { cache: { map: () => ['role-1'] } },
        },
        guild: { name: 'Vaded Gaming', memberCount: 42 },
        reply: jest.fn(async () => undefined),
    } as unknown as ChatInputCommandInteraction & { reply: jest.Mock }
}

describe('executeCustomCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        canUseCommand.mockReturnValue(true)
        incrementUsage.mockResolvedValue(undefined)
    })

    // Returning false lets the dispatcher fall through to its existing
    // "unknown command" handling rather than swallowing real typos.
    it('returns false when the guild has no such command', async () => {
        getCommand.mockResolvedValue(null)

        const interaction = makeInteraction('nope')
        expect(await executeCustomCommand(interaction)).toBe(false)
        expect(interaction.reply).not.toHaveBeenCalled()
    })

    it('returns false for a disabled command', async () => {
        getCommand.mockResolvedValue({
            name: 'gg',
            response: 'hi',
            enabled: false,
        })

        expect(await executeCustomCommand(makeInteraction('gg'))).toBe(false)
    })

    it('replies with the response and resolves placeholders', async () => {
        getCommand.mockResolvedValue({
            name: 'gg',
            response: 'gg {user}, welcome to {server} ({memberCount})',
            enabled: true,
        })

        const interaction = makeInteraction('gg')
        expect(await executeCustomCommand(interaction)).toBe(true)

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'gg <@user-1>, welcome to Vaded Gaming (42)',
                // Author-controlled text must never be able to mass-ping.
                allowedMentions: { parse: [] },
            }),
        )
        expect(incrementUsage).toHaveBeenCalled()
    })

    it('replies with an embed when embedData is configured', async () => {
        getCommand.mockResolvedValue({
            name: 'rules',
            response: null,
            enabled: true,
            embedData: {
                title: 'Rules for {server}',
                description: 'Be nice, {user.name}',
                color: 0x00ff00,
            },
        })

        const interaction = makeInteraction('rules')
        expect(await executeCustomCommand(interaction)).toBe(true)

        const payload = interaction.reply.mock.calls[0][0] as {
            embeds: { data: { title: string; description: string } }[]
        }
        expect(payload.embeds[0].data.title).toBe('Rules for Vaded Gaming')
        expect(payload.embeds[0].data.description).toBe('Be nice, Ada')
    })

    it('refuses when role/channel restrictions deny the user', async () => {
        getCommand.mockResolvedValue({
            name: 'staff',
            response: 'secret',
            enabled: true,
        })
        canUseCommand.mockReturnValue(false)

        const interaction = makeInteraction('staff')
        expect(await executeCustomCommand(interaction)).toBe(true)

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'You cannot use this command here.',
            }),
        )
        expect(incrementUsage).not.toHaveBeenCalled()
    })
})
