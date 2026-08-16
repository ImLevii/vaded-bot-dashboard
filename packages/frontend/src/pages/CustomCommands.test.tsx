import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CustomCommandsPage from './CustomCommands'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import type { CustomCommand } from '@/types'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

const mockGuild = {
    id: '123',
    name: 'Test Guild',
    icon: null,
    owner: true,
    permissions: '8',
    features: [],
    approximate_member_count: 100,
    approximate_presence_count: 50,
}

// Shaped like an actual `custom_commands` row. The previous fixtures were
// built-in commands (category/hasHelp), a shape the API never returns — which
// is why a toggle pointing at a non-existent endpoint shipped green.
function makeCommand(overrides: Partial<CustomCommand> = {}): CustomCommand {
    return {
        id: 'cmd1',
        guildId: '123',
        name: 'gg',
        description: 'Say good game',
        response: 'gg {user}',
        embedData: null,
        enabled: true,
        useCount: 3,
        lastUsed: null,
        allowedRoles: [],
        allowedChannels: [],
        commandKind: 'basic',
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    }
}

const mockCommands: CustomCommand[] = [
    makeCommand(),
    makeCommand({ id: 'cmd2', name: 'rules', description: 'Server rules' }),
    makeCommand({
        id: 'cmd3',
        name: 'clip',
        description: null,
        enabled: false,
    }),
]

function mockGuildStore(guild: typeof mockGuild | null) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
        selectGuild: vi.fn(),
        isLoading: false,
        error: null,
        fetchGuilds: vi.fn(),
    } as any)
}

const renderPage = () =>
    render(
        <MemoryRouter>
            <CustomCommandsPage />
        </MemoryRouter>,
    )

describe('CustomCommandsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)
    })

    test('shows no server selected when no guild', () => {
        mockGuildStore(null)
        renderPage()
        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
    })

    test('lists the guild custom commands', async () => {
        mockGuildStore(mockGuild)
        renderPage()

        expect(await screen.findByText('/gg')).toBeInTheDocument()
        expect(screen.getByText('/rules')).toBeInTheDocument()
        expect(screen.getByText('/clip')).toBeInTheDocument()
    })

    // description is nullable on custom_commands; the old page called
    // .toLowerCase() on it and threw for any command created without one.
    test('renders and searches commands with a null description', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        renderPage()

        await screen.findByText('/clip')
        await user.type(screen.getByPlaceholderText(/search/i), 'clip')

        expect(await screen.findByText('/clip')).toBeInTheDocument()
        expect(screen.queryByText('/gg')).not.toBeInTheDocument()
    })

    // Toggling used to POST /commands/:id/toggle, a route that does not exist.
    // It must PATCH /commands/:name instead.
    test('toggles a command by name, not id', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.toggle).mockResolvedValue({ data: {} } as any)
        renderPage()

        await screen.findByText('/gg')
        await user.click(screen.getByRole('switch', { name: 'Toggle gg' }))

        await waitFor(() => {
            expect(api.commands.toggle).toHaveBeenCalledWith('123', 'gg', false)
        })
    })

    test('reverts the toggle when the request fails', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.toggle).mockRejectedValue(new Error('nope'))
        renderPage()

        await screen.findByText('/gg')
        const toggle = screen.getByRole('switch', { name: 'Toggle gg' })
        expect(toggle).toBeChecked()

        await user.click(toggle)

        await waitFor(() => {
            expect(
                screen.getByRole('switch', { name: 'Toggle gg' }),
            ).toBeChecked()
        })
    })

    test('creates a command and reloads the list', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.create).mockResolvedValue({ data: {} } as any)
        renderPage()

        await screen.findByText('/gg')
        await user.click(screen.getByRole('button', { name: /new command/i }))

        await user.type(screen.getByLabelText(/command name/i), 'welcome')
        // `{{` is userEvent's escape for a literal `{` — unescaped, it parses
        // `{user}` as a key descriptor and types nothing.
        await user.type(
            screen.getByLabelText(/^response$/i),
            'Welcome {{user}!',
        )
        await user.click(screen.getByRole('button', { name: /^create$/i }))

        await waitFor(() => {
            expect(api.commands.create).toHaveBeenCalledWith('123', {
                name: 'welcome',
                response: 'Welcome {user}!',
                description: undefined,
            })
        })
    })

    // Discord rejects uppercase and spaces in slash command names, so catch it
    // before the round-trip rather than surfacing an opaque 400.
    test('rejects an invalid command name without calling the API', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        renderPage()

        await screen.findByText('/gg')
        await user.click(screen.getByRole('button', { name: /new command/i }))

        await user.type(screen.getByLabelText(/command name/i), 'Bad Name')
        await user.type(screen.getByLabelText(/^response$/i), 'hi')
        await user.click(screen.getByRole('button', { name: /^create$/i }))

        expect(await screen.findByText(/1-32 lowercase/i)).toBeInTheDocument()
        expect(api.commands.create).not.toHaveBeenCalled()
    })

    test('deletes a command', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.remove).mockResolvedValue({ data: {} } as any)
        renderPage()

        await screen.findByText('/gg')
        await user.click(screen.getByRole('button', { name: 'Delete gg' }))

        await waitFor(() => {
            expect(api.commands.remove).toHaveBeenCalledWith('123', 'gg')
        })
        await waitFor(() => {
            expect(screen.queryByText('/gg')).not.toBeInTheDocument()
        })
    })

    test('edits an existing command by name', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.update).mockResolvedValue({ data: {} } as any)
        renderPage()

        await screen.findByText('/gg')
        await user.click(screen.getByRole('button', { name: 'Edit gg' }))

        const responseField = screen.getByLabelText(/^response$/i)
        await user.clear(responseField)
        await user.type(responseField, 'updated')
        await user.click(screen.getByRole('button', { name: /^save$/i }))

        await waitFor(() => {
            expect(api.commands.update).toHaveBeenCalledWith('123', 'gg', {
                response: 'updated',
                description: 'Say good game',
            })
        })
    })

    test('shows the empty state when the guild has no commands', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: [] },
        } as any)
        renderPage()

        expect(await screen.findByText('No commands found')).toBeInTheDocument()
    })
})
