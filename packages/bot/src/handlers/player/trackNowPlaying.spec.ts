// Mock the dependencies FIRST - before any imports
const mockWarnLog = jest.fn()
const mockDebugLog = jest.fn()
const mockGetAutoplayCount = jest.fn()
const mockGetFallbackLabel = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: mockDebugLog,
    errorLog: jest.fn(),
    warnLog: mockWarnLog,
    infoLog: jest.fn(),
    successLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    constants: {
        MAX_AUTOPLAY_TRACKS: 50,
    },
}))

jest.mock('../../utils/general/embeds', () => ({
    createEmbed: jest.fn(),
    EMBED_COLORS: { MUSIC: '#FF0000' },
}))

jest.mock('../../utils/music/autoplayManager', () => ({
    getAutoplayCount: (guildId: string) => mockGetAutoplayCount(guildId),
}))

jest.mock('../../utils/music/buttonComponents', () => ({
    createMusicControlButtons: jest.fn(() => ({ type: 1, components: [] })),
    createMusicActionButtons: jest.fn(() => ({ type: 1, components: [] })),
}))

jest.mock('../../utils/music/autoplay/autoplayAcceptanceCache', () => ({
    getPerSourceAcceptanceRateCached: jest.fn(async () => []),
}))

jest.mock('../../lastfm', () => ({
    isLastFmConfigured: jest.fn(() => false),
    getSessionKeyForUser: jest.fn(),
    getTrackMetadata: jest.fn(),
    updateNowPlaying: jest.fn(),
    scrobble: jest.fn(),
}))

jest.mock('./streamBridge', () => ({
    getStreamBridgeFallbackLabel: (track: unknown) =>
        mockGetFallbackLabel(track),
}))

// NOW import types and the module under test after mocks are set up
import { describe, expect, it, beforeEach } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { TextChannel, Guild, Message } from 'discord.js'
import {
    sendNowPlayingEmbed,
    registerNowPlayingMessage,
    getSongInfoMessage,
    deleteSongInfoMessage,
} from './trackNowPlaying'

/** Pulls the embed description out of whichever call actually rendered it. */
function descriptionOf(call: { embeds: { data: { description?: string } }[] }) {
    return call.embeds[0]?.data.description ?? ''
}

function footerOf(call: {
    embeds: { data: { footer?: { text?: string } } }[]
}) {
    return call.embeds[0]?.data.footer?.text ?? ''
}

describe('sendNowPlayingEmbed', () => {
    let mockQueue: Partial<GuildQueue>
    let mockTrack: Partial<Track>
    let mockGuild: Partial<Guild>
    let mockChannel: Partial<TextChannel>
    let mockMessage: Partial<Message>
    let guildCounter = 0

    beforeEach(() => {
        jest.clearAllMocks()
        mockGetAutoplayCount.mockResolvedValue(3)
        mockGetFallbackLabel.mockReturnValue(undefined)

        // Unique guild per test: the now-playing registry is module-level
        // state that outlives individual test cases.
        guildCounter += 1
        mockGuild = { id: `guild-${guildCounter}` }

        mockMessage = {
            id: 'message-789',
            edit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        }

        mockChannel = {
            id: 'channel-456',
            send: jest
                .fn<() => Promise<unknown>>()
                .mockResolvedValue(mockMessage),
            messages: {
                fetch: jest
                    .fn<() => Promise<unknown>>()
                    .mockResolvedValue(mockMessage),
            },
        } as unknown as Partial<TextChannel>

        mockTrack = {
            title: 'Test Track',
            author: 'Test Artist',
            url: 'https://example.com/track',
            thumbnail: 'https://example.com/thumb.png',
            duration: '3:30',
            durationMS: 210000,
            requestedBy: null,
        }

        mockQueue = {
            guild: mockGuild as Guild,
            metadata: { channel: mockChannel as TextChannel },
            currentTrack: mockTrack as Track,
            node: { streamTime: 1000, volume: 50 },
            repeatMode: 0,
        } as unknown as Partial<GuildQueue>
    })

    it('does nothing when the queue has no text channel to post in', async () => {
        mockQueue.metadata = {}

        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            false,
        )

        expect(mockChannel.send).not.toHaveBeenCalled()
    })

    it('sends a new message and registers it when nothing is registered yet', async () => {
        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            false,
        )

        expect(mockChannel.send).toHaveBeenCalled()
        expect(getSongInfoMessage(mockGuild.id as string)).toEqual({
            messageId: 'message-789',
            channelId: 'channel-456',
            trackUrl: 'https://example.com/track',
        })
    })

    it('edits the registered message instead of posting a second one', async () => {
        // What /play pre-registers: its own reply, with no trackUrl yet.
        registerNowPlayingMessage(
            mockGuild.id as string,
            'preregistered-id',
            'channel-456',
        )

        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            false,
        )

        expect(mockMessage.edit).toHaveBeenCalled()
        expect(mockChannel.send).not.toHaveBeenCalled()
        // Re-registered with the track URL, which is what marks it as no
        // longer a pending pre-registration.
        expect(getSongInfoMessage(mockGuild.id as string)?.trackUrl).toBe(
            'https://example.com/track',
        )
    })

    it('posts a fresh message when the registered one can no longer be fetched', async () => {
        registerNowPlayingMessage(
            mockGuild.id as string,
            'deleted-id',
            'channel-456',
        )
        ;(
            mockChannel.messages as unknown as { fetch: jest.Mock }
        ).fetch.mockRejectedValue(new Error('Unknown Message'))

        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            false,
        )

        expect(mockChannel.send).toHaveBeenCalled()
    })

    it('ignores a registration that points at a different channel', async () => {
        registerNowPlayingMessage(
            mockGuild.id as string,
            'other-channel-msg',
            'some-other-channel',
        )

        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            false,
        )

        expect(mockMessage.edit).not.toHaveBeenCalled()
        expect(mockChannel.send).toHaveBeenCalled()
    })

    it('credits the requesting user when the track carries one', async () => {
        mockTrack.requestedBy = {
            username: 'nulled_xrp',
        } as Track['requestedBy']

        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            false,
        )

        const call = (mockChannel.send as jest.Mock).mock.calls[0][0] as never
        expect(descriptionOf(call)).toContain('**nulled_xrp**')
        expect(footerOf(call)).toContain('Added by nulled_xrp')
    })

    it('falls back to the autoplay label only when there is no requester', async () => {
        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            false,
        )

        const call = (mockChannel.send as jest.Mock).mock.calls[0][0] as never
        expect(descriptionOf(call)).toContain('🤖 Autoplay')
        expect(footerOf(call)).toContain('Added automatically')
    })

    it('notes the stream-bridge fallback stage in the footer', async () => {
        mockGetFallbackLabel.mockReturnValue('SoundCloud title-only search')

        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            false,
        )

        const call = (mockChannel.send as jest.Mock).mock.calls[0][0] as never
        expect(footerOf(call)).toContain(
            'via fallback: SoundCloud title-only search',
        )
    })

    it('reports the autoplay counter for autoplay tracks', async () => {
        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            true,
        )

        const call = (mockChannel.send as jest.Mock).mock.calls[0][0] as never
        expect(footerOf(call)).toContain('🤖 Autoplay • 3/50 tracks')
    })

    it('clears the registration on request', async () => {
        await sendNowPlayingEmbed(
            mockQueue as GuildQueue,
            mockTrack as Track,
            false,
        )
        expect(getSongInfoMessage(mockGuild.id as string)).toBeDefined()

        deleteSongInfoMessage(mockGuild.id as string)

        expect(getSongInfoMessage(mockGuild.id as string)).toBeUndefined()
    })
})
