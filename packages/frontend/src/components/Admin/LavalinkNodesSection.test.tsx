import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import LavalinkNodesSection from './LavalinkNodesSection'
import { api, type MusicBotServiceInfo } from '@/services/api'

vi.mock('@/services/api', () => ({
    api: {
        admin: {
            lavalink: {
                getNodes: vi.fn(),
                getService: vi.fn(),
                addNode: vi.fn(),
                removeNode: vi.fn(),
                switchNode: vi.fn(),
            },
        },
    },
}))

const service: MusicBotServiceInfo = {
    service: 'vg-music-bot',
    bot: { id: '123456789012345678', username: 'Vaded Music', ready: true },
    capabilities: { musicEmbeds: 1, lavalinkRegion: 'US' },
    healthyNodes: 0,
    revision: null,
}
const response = (data: MusicBotServiceInfo) =>
    ({ data }) as Awaited<ReturnType<typeof api.admin.lavalink.getService>>
const flush = async () => {
    await act(async () => {
        await Promise.resolve()
    })
}

describe('LavalinkNodesSection bot connection', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        vi.mocked(api.admin.lavalink.getNodes).mockResolvedValue({
            data: [],
        } as never)
        vi.mocked(api.admin.lavalink.getService).mockResolvedValue(
            response(service),
        )
        vi.mocked(api.admin.lavalink.addNode).mockResolvedValue({
            data: {},
        } as never)
    })
    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    test('identifies the bot controlled by the dashboard and reports unavailable US nodes', async () => {
        render(<LavalinkNodesSection />)
        await flush()
        expect(
            screen.getByText(/Vaded Music.*123456789012345678/),
        ).toBeInTheDocument()
        expect(screen.getByText(/Connected to Discord/)).toBeInTheDocument()
        expect(
            screen.getByText('No healthy USA Lavalink servers available.'),
        ).toBeInTheDocument()
    })

    test('does not display stale nodes or controls when the configured bot lacks the update', async () => {
        vi.mocked(api.admin.lavalink.getService).mockResolvedValue(
            response({
                ...service,
                capabilities: { musicEmbeds: 0, lavalinkRegion: 'US' },
            }),
        )
        render(<LavalinkNodesSection />)
        await flush()
        expect(
            screen.getByText(/Could not verify the updated music bot/),
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Add' }),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByText(/Connected to Discord/),
        ).not.toBeInTheDocument()
    })

    test('clears a failed connection after polling succeeds', async () => {
        vi.mocked(api.admin.lavalink.getService).mockRejectedValueOnce(
            new Error('offline'),
        )
        render(<LavalinkNodesSection />)
        await flush()
        expect(
            screen.getByText(/Could not verify the updated music bot/),
        ).toBeInTheDocument()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000)
        })
        expect(screen.queryByText(/Could not verify/)).not.toBeInTheDocument()
        expect(screen.getByText(/Vaded Music/)).toBeInTheDocument()
    })

    test('preserves Lavalink password spaces and punctuation in dashboard additions', async () => {
        render(<LavalinkNodesSection />)
        await flush()
        fireEvent.change(screen.getByPlaceholderText('Name'), {
            target: { value: 'Miami' },
        })
        fireEvent.change(screen.getByPlaceholderText('Host'), {
            target: { value: 'omega.vexanode.cloud' },
        })
        fireEvent.change(screen.getByPlaceholderText('Port'), {
            target: { value: '2031' },
        })
        fireEvent.change(screen.getByPlaceholderText('Password'), {
            target: { value: '  pass!:/  ' },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        await flush()
        expect(api.admin.lavalink.addNode).toHaveBeenCalledWith({
            name: 'Miami',
            host: 'omega.vexanode.cloud',
            port: 2031,
            auth: '  pass!:/  ',
            secure: false,
        })
    })
})
