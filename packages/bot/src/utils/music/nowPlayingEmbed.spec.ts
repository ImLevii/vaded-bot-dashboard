import { describe, it, expect } from '@jest/globals'
import {
    buildPlayResponseEmbed,
    buildVinylAttachment,
    detectSource,
} from './nowPlayingEmbed'

const fakeUser = {
    tag: 'Admin#0001',
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/abc.png',
}

/**
 * Field names carry an emoji prefix ("📡 Source"), so match on the trailing
 * label — asserting the bare name silently matches nothing and makes
 * "field is absent" checks pass for the wrong reason.
 */
function findField(
    fields: { name: string; value: string }[] | undefined,
    label: string,
) {
    return (fields ?? []).find((f) => f.name.endsWith(label))
}

describe('detectSource', () => {
    it('prefers an explicit track.source when provided', () => {
        expect(detectSource({ source: 'spotify' }).label).toBe('Spotify')
    })

    it('falls back to URL sniffing for youtube.com', () => {
        expect(
            detectSource({ url: 'https://youtube.com/watch?v=abc' }).label,
        ).toBe('YouTube')
    })

    it('falls back to URL sniffing for youtu.be', () => {
        expect(detectSource({ url: 'https://youtu.be/abc' }).label).toBe(
            'YouTube',
        )
    })

    it('falls back to URL sniffing for open.spotify.com', () => {
        expect(
            detectSource({ url: 'https://open.spotify.com/track/abc' }).label,
        ).toBe('Spotify')
    })

    it('falls back to URL sniffing for soundcloud.com', () => {
        expect(
            detectSource({ url: 'https://soundcloud.com/artist/track' }).label,
        ).toBe('SoundCloud')
    })

    it('returns generic "Music" badge when nothing matches', () => {
        expect(
            detectSource({ url: 'https://example.com/track.mp3' }).label,
        ).toBe('Music')
        expect(detectSource({}).label).toBe('Music')
    })
})

describe('buildPlayResponseEmbed', () => {
    const baseTrack = {
        title: 'Bohemian Rhapsody',
        author: 'Queen',
        url: 'https://youtube.com/watch?v=abc',
        thumbnail: 'https://img.youtube.com/vi/abc/hq.jpg',
        duration: '5:55',
    }

    it('produces a Now Playing embed with title, author, thumbnail, source, duration, footer', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'nowPlaying',
            track: baseTrack,
            requestedBy: fakeUser,
        })
        const data = embed.data

        expect(data.title).toBe('Bohemian Rhapsody')
        expect(data.description).toContain('Queen')
        expect(data.url).toBe(baseTrack.url)
        // The nowPlaying layout reserves the thumbnail slot for the spinning
        // vinyl and promotes the track art to the large image.
        expect(data.thumbnail?.url).toBe('attachment://vinyl.gif')
        expect(data.image?.url).toBe(baseTrack.thumbnail)
        expect(data.author?.name).toContain('Now Playing')
        expect(data.footer?.text).toContain('Admin#0001')

        expect(findField(data.fields, 'Duration')?.value).toBe('`5:55`')
        expect(findField(data.fields, 'Source')?.value).toBe('`YouTube`')
    })

    it('omits the Duration field when duration is 0:00 (unknown)', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'nowPlaying',
            track: { ...baseTrack, duration: '0:00' },
            requestedBy: fakeUser,
        })
        expect(findField(embed.data.fields, 'Duration')).toBeUndefined()
    })

    it('uses the track art as the thumbnail for non-nowPlaying kinds', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'addedToQueue',
            track: baseTrack,
            requestedBy: fakeUser,
            queuePosition: 3,
        })
        expect(embed.data.thumbnail?.url).toBe(baseTrack.thumbnail)
        expect(embed.data.image).toBeUndefined()
    })

    it('uses "Added to Queue" header + shows queue position when addedToQueue', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'addedToQueue',
            track: baseTrack,
            requestedBy: fakeUser,
            queuePosition: 3,
        })
        expect(embed.data.author?.name).toContain('Added to Queue')
        expect(findField(embed.data.fields, 'Position')?.value).toBe('`#3`')
    })

    it('renders position 0 as "Now" rather than a queue slot', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'addedToQueue',
            track: baseTrack,
            requestedBy: fakeUser,
            queuePosition: 0,
        })
        expect(findField(embed.data.fields, 'Position')?.value).toBe('`Now`')
    })

    it('renders playlistQueued with title + track count instead of single track fields', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'playlistQueued',
            track: baseTrack,
            requestedBy: fakeUser,
            playlist: { title: 'Road Trip Vibes', trackCount: 42 },
        })
        expect(embed.data.author?.name).toContain('Playlist Queued')
        expect(embed.data.title).toBe('Road Trip Vibes')
        expect(embed.data.description).toContain('42')
        // Playlist responses don't carry per-track fields — those belong to
        // individual track notifications, not the playlist summary.
        expect(findField(embed.data.fields, 'Duration')).toBeUndefined()
    })

    it('falls back to "Unknown Track" when title is empty', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'nowPlaying',
            track: { ...baseTrack, title: '' },
            requestedBy: fakeUser,
        })
        expect(embed.data.title).toBe('Unknown Track')
    })

    it('uses Spotify badge color + label for spotify tracks', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'nowPlaying',
            track: {
                ...baseTrack,
                url: 'https://open.spotify.com/track/abc',
                source: 'spotify',
            },
            requestedBy: fakeUser,
        })
        expect(findField(embed.data.fields, 'Source')?.value).toBe('`Spotify`')
        expect(embed.data.color).toBe(0x1db954)
    })
})

describe('buildVinylAttachment', () => {
    it('returns null when the gif is not on disk instead of throwing', () => {
        // jest maps vinylAsset to a path that does not exist, so this exercises
        // the existsSync guard that keeps a missing asset from breaking replies.
        expect(buildVinylAttachment()).toBeNull()
    })
})
