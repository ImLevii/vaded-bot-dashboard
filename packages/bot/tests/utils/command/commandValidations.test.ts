import { createMockInteraction } from '../../__mocks__/discord'

jest.mock('@lucky/shared/utils', () => ({
    handleError: jest.fn((err: Error) => ({
        message: err.message,
        code: 'TEST_ERROR',
    })),
    createUserErrorMessage: jest.fn((err: { message: string }) => err.message),
}))

jest.mock('../../../src/utils/general/interactionReply', () => ({
    interactionReply: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../src/utils/general/embeds', () => ({
    errorEmbed: jest.fn((_title: string, description: string) => ({
        title: _title,
        description,
    })),
}))

import { requireGuild } from '../../../src/utils/command/commandValidations'
import { interactionReply } from '../../../src/utils/general/interactionReply'
import { handleError } from '@lucky/shared/utils'

const interactionReplyMock = jest.mocked(interactionReply)
const handleErrorMock = jest.mocked(handleError)

function createInteraction(overrides: Record<string, unknown> = {}) {
    return createMockInteraction({
        commandName: 'test-command',
        ...overrides,
    })
}

describe('commandValidations', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        handleErrorMock.mockImplementation((err: Error) => ({
            message: err.message,
            code: 'TEST_ERROR',
        }))
    })

    describe('requireGuild', () => {
        it('returns true and does not reply when guildId exists', async () => {
            const interaction = createInteraction()
            const result = await requireGuild(interaction)
            expect(result).toBe(true)
            expect(interactionReplyMock).not.toHaveBeenCalled()
        })

        it('returns false, calls handleError and replies with error embed when no guildId', async () => {
            const interaction = createInteraction({ guildId: null })
            const result = await requireGuild(interaction)

            expect(result).toBe(false)
            expect(handleErrorMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Command can only be used in a guild/server',
                }),
                expect.objectContaining({ userId: '123456789' }),
            )
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        embeds: expect.arrayContaining([
                            expect.objectContaining({ title: 'Error' }),
                        ]),
                    }),
                }),
            )
        })
    })
})
