import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { ChannelType, Collection } from 'discord.js'
import type { Guild, TextChannel } from 'discord.js'
import { resolveAnnouncementChannel } from './playContext'

function makeTextChannel(id: string, canPost: boolean): TextChannel {
    return {
        id,
        type: ChannelType.GuildText,
        permissionsFor: () => ({
            has: () => canPost,
        }),
    } as unknown as TextChannel
}

function makeGuild(options: {
    channels: TextChannel[]
    systemChannel?: TextChannel | null
}): Guild {
    const cache = new Collection(
        options.channels.map((channel) => [channel.id, channel]),
    )

    return {
        members: { me: {} },
        systemChannel: options.systemChannel ?? null,
        channels: { cache },
    } as unknown as Guild
}

describe('resolveAnnouncementChannel', () => {
    const originalConfiguredId = process.env.WEBAPP_MUSIC_ANNOUNCE_CHANNEL_ID

    beforeEach(() => {
        delete process.env.WEBAPP_MUSIC_ANNOUNCE_CHANNEL_ID
    })

    afterEach(() => {
        if (originalConfiguredId) {
            process.env.WEBAPP_MUSIC_ANNOUNCE_CHANNEL_ID = originalConfiguredId
        } else {
            delete process.env.WEBAPP_MUSIC_ANNOUNCE_CHANNEL_ID
        }
    })

    it('prefers the configured channel over the system channel', () => {
        const configured = makeTextChannel('configured-1', true)
        const system = makeTextChannel('system-1', true)
        process.env.WEBAPP_MUSIC_ANNOUNCE_CHANNEL_ID = 'configured-1'

        const guild = makeGuild({
            channels: [configured, system],
            systemChannel: system,
        })

        expect(resolveAnnouncementChannel(guild)).toBe(configured)
    })

    it('falls back to the system channel when the configured channel is not postable', () => {
        const configured = makeTextChannel('configured-1', false)
        const system = makeTextChannel('system-1', true)
        process.env.WEBAPP_MUSIC_ANNOUNCE_CHANNEL_ID = 'configured-1'

        const guild = makeGuild({
            channels: [configured, system],
            systemChannel: system,
        })

        expect(resolveAnnouncementChannel(guild)).toBe(system)
    })

    it('falls back to the system channel when the configured channel does not exist in this guild', () => {
        const system = makeTextChannel('system-1', true)
        process.env.WEBAPP_MUSIC_ANNOUNCE_CHANNEL_ID = 'not-in-this-guild'

        const guild = makeGuild({
            channels: [system],
            systemChannel: system,
        })

        expect(resolveAnnouncementChannel(guild)).toBe(system)
    })

    it('falls back to the first postable text channel when no channel is configured and there is no system channel', () => {
        const other = makeTextChannel('other-1', true)

        const guild = makeGuild({
            channels: [other],
            systemChannel: null,
        })

        expect(resolveAnnouncementChannel(guild)).toBe(other)
    })
})
