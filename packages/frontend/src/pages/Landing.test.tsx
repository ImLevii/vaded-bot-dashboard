import { describe, test, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Landing from './Landing'
import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { useReducedMotion } from 'framer-motion'

vi.mock('@/stores/authStore')
vi.mock('@/hooks/usePageMetadata')
vi.mock('framer-motion', async () => {
    const React = await import('react')
    const passthrough = (tag: string) =>
        React.forwardRef(({ children, ...props }: any, ref: any) =>
            React.createElement(tag, { ...props, ref }, children),
        )
    return {
        motion: new Proxy({}, { get: (_t, prop: string) => passthrough(prop) }),
        AnimatePresence: ({ children }: any) => children,
        useReducedMotion: vi.fn(() => false),
    }
})

const mockLogin = vi.fn()

function setupMocks(overrides?: { prefersReducedMotion?: boolean }) {
    const { prefersReducedMotion = false } = overrides || {}

    vi.mocked(useAuthStore).mockImplementation(((
        selector?: (value: unknown) => unknown,
    ) => {
        const state = { login: mockLogin }
        return selector ? selector(state) : state
    }) as typeof useAuthStore)

    vi.mocked(usePageMetadata).mockImplementation(() => undefined)
    vi.mocked(useReducedMotion).mockReturnValue(prefersReducedMotion)
}

describe('Landing', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setupMocks()
        // Mock the Discord client ID env var for tests
        ;(import.meta.env as Record<string, unknown>).VITE_DISCORD_CLIENT_ID =
            '962198089161134131'
    })

    test('sets page metadata on mount', () => {
        render(<Landing />)
        expect(usePageMetadata).toHaveBeenCalledWith({
            title: expect.stringMatching(/discord music bot/i),
            description: expect.stringMatching(/autoplay/i),
        })
    })

    test('renders top nav with brand wordmark', () => {
        render(<Landing />)
        const wordmarks = screen.getAllByText('VADED')
        expect(wordmarks.length).toBeGreaterThanOrEqual(1)
    })

    test('renders hero with logo, eyebrow and headline', () => {
        render(<Landing />)
        const logos = screen.getAllByAltText('Vaded Gaming')
        expect(logos.length).toBeGreaterThanOrEqual(2)
        const eyebrows = screen.getAllByText(/Open source/i)
        expect(eyebrows.length).toBeGreaterThanOrEqual(1)
        expect(
            screen.getByText(/A Discord bot built right\./i),
        ).toBeInTheDocument()
        expect(screen.getByText(/And yours to run\./i)).toBeInTheDocument()
    })

    test('renders Add to Discord primary CTA in hero and nav when invite URL is set', () => {
        render(<Landing />)
        const inviteLinks = screen.getAllByRole('link', {
            name: /Add to Discord/i,
        })
        expect(inviteLinks.length).toBeGreaterThanOrEqual(2)
        inviteLinks.forEach((link) => {
            expect(link).toHaveAttribute(
                'href',
                expect.stringContaining('discord.com/oauth2/authorize'),
            )
            expect(link).toHaveAttribute('target', '_blank')
            expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        })
    })

    test('falls back to the public default client id when env var not set', () => {
        const originalEnv = { ...import.meta.env }
        ;(import.meta.env as Record<string, unknown>).VITE_DISCORD_CLIENT_ID =
            ''
        try {
            render(<Landing />)
            // With no env override, the CTA stays enabled and links to the
            // bundled public Application ID — no operator config required.
            const inviteLinks = screen.getAllByRole('link', {
                name: /Add to Discord/i,
            })
            expect(inviteLinks.length).toBeGreaterThanOrEqual(2)
            inviteLinks.forEach((link) => {
                expect(link).toHaveAttribute(
                    'href',
                    expect.stringContaining('client_id=962198089161134131'),
                )
            })
        } finally {
            Object.assign(import.meta.env, originalEnv)
        }
    })

    test('dashboard nav button triggers login', () => {
        render(<Landing />)
        fireEvent.click(screen.getByRole('button', { name: /dashboard/i }))
        expect(mockLogin).toHaveBeenCalled()
    })

    test('renders features section with five user-facing items', () => {
        render(<Landing />)
        expect(
            screen.getByText(/Music with smart autoplay/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/Moderation that doesn't sleep/i),
        ).toBeInTheDocument()
        expect(
            screen.getAllByText(/Custom commands/i).length,
        ).toBeGreaterThanOrEqual(1)
        expect(screen.getByText(/A real web dashboard/i)).toBeInTheDocument()
        expect(screen.getByText(/Embed builder/i)).toBeInTheDocument()
    })

    test('renders why-self-host section with three reason cards', () => {
        render(<Landing />)
        expect(
            screen.getByText('Your guild data stays yours'),
        ).toBeInTheDocument()
        expect(screen.getByText('Fork the source')).toBeInTheDocument()
        expect(
            screen.getByText('Free, with no premium tier'),
        ).toBeInTheDocument()
    })

    test('renders command list with all six commands and category tags', () => {
        render(<Landing />)
        expect(screen.getByText('/play')).toBeInTheDocument()
        expect(screen.getByText('/autoplay')).toBeInTheDocument()
        expect(screen.getByText('/queue')).toBeInTheDocument()
        expect(screen.getByText('/mod ban')).toBeInTheDocument()
        expect(screen.getByText('/automod')).toBeInTheDocument()
        expect(screen.getByText('/cc create')).toBeInTheDocument()
        expect(screen.getAllByText(/music/i).length).toBeGreaterThanOrEqual(2)
        expect(screen.getAllByText(/mod$/i).length).toBeGreaterThanOrEqual(1)
        expect(
            screen.getByText('+ 100 more in the dashboard'),
        ).toBeInTheDocument()
    })

    test('renders stack list with all six services', () => {
        render(<Landing />)
        expect(screen.getByText('vaded-gaming-bot')).toBeInTheDocument()
        expect(screen.getByText('lucky-backend')).toBeInTheDocument()
        expect(screen.getByText('lucky-frontend')).toBeInTheDocument()
        expect(screen.getByText('postgres')).toBeInTheDocument()
        expect(screen.getByText('redis')).toBeInTheDocument()
        expect(screen.getByText('nginx')).toBeInTheDocument()
    })

    test('renders footer copyright', () => {
        render(<Landing />)
        expect(screen.getByText(/© 2026 VADED GAMING\. ISC\./)).toBeInTheDocument()
    })

    test('renders footer with Terms, Privacy and Discord support links', () => {
        render(<Landing />)
        expect(screen.getByRole('link', { name: /Terms/i })).toHaveAttribute(
            'href',
            '/terms',
        )
        expect(screen.getByRole('link', { name: /Privacy/i })).toHaveAttribute(
            'href',
            '/privacy',
        )
        const supportLink = screen.getByRole('link', {
            name: /Support server/i,
        })
        expect(supportLink).toHaveAttribute('target', '_blank')
        expect(supportLink).toHaveAttribute('rel', 'noreferrer')
    })

    test('respects prefers-reduced-motion', () => {
        setupMocks({ prefersReducedMotion: true })
        render(<Landing />)
        expect(
            screen.getByText(/A Discord bot built right\./i),
        ).toBeInTheDocument()
    })
})

