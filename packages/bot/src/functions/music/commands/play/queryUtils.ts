import type {
    ChatInputCommandInteraction,
    GuildMember,
    SendableChannels,
    VoiceBasedChannel,
} from 'discord.js'
import type { CustomClient } from '../../../../types'
import {
    requireVoiceChannel,
    requireDJRole,
} from '../../../../utils/command/commandValidations'
import {
    buildPlayResponseEmbed,
    buildVinylAttachment,
} from '../../../../utils/music/nowPlayingEmbed'
import {
    createMusicControlButtons,
    createMusicActionButtons,
} from '../../../../utils/music/buttonComponents'
import { createErrorEmbed } from '../../../../utils/general/embeds'
import { interactionReply } from '../../../../utils/general/interactionReply'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { withTimeout } from '@lucky/shared/utils/async'
import { assertDefined } from '@lucky/shared/utils/guards'
import { isUrl } from './urlNormalization'
import { resolveQueryWithFallbacks } from './handlers/resolveProvider'

export {
    isUrl,
    normalizeSoundCloudUrl,
    normalizeYoutubeUrl,
    normalizeSpotifyUrl,
    cleanQueryInput,
} from './urlNormalization'

export const DISCORD_UNKNOWN_INTERACTION_CODE = 10062

export function isUnknownInteractionError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === DISCORD_UNKNOWN_INTERACTION_CODE
    )
}

export async function expandSoundCloudShortUrl(url: string): Promise<string> {
    // Fast path: not a short link
    if (!url.includes('on.soundcloud.com')) {
        return url
    }

    try {
        const parsed = new URL(url)
        if (parsed.hostname !== 'on.soundcloud.com') {
            return url
        }

        // Follow redirects with a 5-second timeout, using HEAD first (no body download)
        const expanded = await withTimeout(
            (async () => {
                try {
                    const response = await (global.fetch as typeof fetch)(url, {
                        method: 'HEAD',
                        redirect: 'follow',
                    })
                    const finalUrl = response.url

                    // Security check: ensure resolved URL is a soundcloud domain
                    const finalParsed = new URL(finalUrl)
                    if (
                        finalParsed.hostname !== 'soundcloud.com' &&
                        !finalParsed.hostname?.endsWith('.soundcloud.com')
                    ) {
                        // Redirect went somewhere unexpected — reject and fall back
                        throw new Error(
                            `Redirect destination is not a soundcloud.com domain: ${finalUrl}`,
                        )
                    }

                    debugLog({
                        message: 'SoundCloud short URL expanded',
                        data: { originalUrl: url, expandedUrl: finalUrl },
                    })

                    return finalUrl
                } catch (innerError) {
                    debugLog({
                        message:
                            'Failed to expand SoundCloud short URL in fetch block',
                        data: { url, error: String(innerError) },
                    })
                    throw innerError
                }
            })(),
            5000,
            'soundcloud-short-url-expansion',
        )

        return expanded
    } catch (error) {
        // Network error, timeout, or security validation failed — gracefully fall back
        debugLog({
            message:
                'SoundCloud short URL expansion failed, using original URL',
            data: {
                originalUrl: url,
                error: String(error),
            },
        })
        return url
    }
}

/**
 * IDs of the humans currently in the voice channel, recorded as queue metadata
 * for the vote-based commands. Shared by /play and /playtop|/playskip so both
 * capture the same audience.
 */
export function collectVoiceMemberIds(
    voiceChannel: VoiceBasedChannel,
    clientUser?: { id: string } | null,
): string[] {
    if (!voiceChannel.members) return []
    return Array.from(voiceChannel.members.values())
        .filter((m) => m.id !== clientUser?.id)
        .map((m) => m.id)
}

type PlayAtTopOptions = {
    client: CustomClient
    interaction: ChatInputCommandInteraction
    skipCurrent: boolean
    commandName: string
}

export async function executePlayAtTop({
    client,
    interaction,
    skipCurrent,
    commandName,
}: PlayAtTopOptions): Promise<void> {
    if (!interaction.guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'This command can only be used in a server',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const member = interaction.member as GuildMember
    if (!(await requireVoiceChannel(interaction))) return
    if (!(await requireDJRole(interaction, interaction.guildId))) return

    const voiceChannel = assertDefined(
        member.voice.channel,
        'voice channel present after requireVoiceChannel guard',
    )

    try {
        await interaction.deferReply()
    } catch (error) {
        if (isUnknownInteractionError(error)) return
        throw error
    }

    const query = interaction.options.getString('query', true)

    try {
        const vcMemberIds = collectVoiceMemberIds(voiceChannel, client.user)
        const { result } = await resolveQueryWithFallbacks({
            client,
            guildId: interaction.guildId,
            textId: interaction.channelId,
            channel: interaction.channel as SendableChannels | null,
            voiceChannel,
            query,
            requestedProvider: 'default',
            requestedBy: interaction.user,
            vcMemberIds,
        })
        const track = result.track
        const queue = result.queue

        // Read after resolveQueryWithFallbacks above: when nothing was
        // already playing the track went straight to the player and never
        // landed in `tracks`, so an empty list here means "this is playing
        // now", not "position #1".
        const tracks = queue.tracks.toArray()
        const startedImmediately = tracks.length === 0
        if (!startedImmediately) {
            queue.removeTrack(track)
            queue.insertTrack(track, 0)
            if (skipCurrent) await queue.node.skip()
        }

        const showAsNowPlaying = skipCurrent || startedImmediately
        const embed = buildPlayResponseEmbed(
            showAsNowPlaying
                ? { kind: 'nowPlaying', track, requestedBy: interaction.user }
                : {
                      kind: 'addedToQueue',
                      track,
                      requestedBy: interaction.user,
                      queuePosition: 1,
                  },
        )
        // See executePlayHandler: the nowPlaying layout references
        // attachment://vinyl.gif, so the file has to be sent with it.
        const vinyl = showAsNowPlaying ? buildVinylAttachment() : null

        await interactionReply({
            interaction,
            content: {
                embeds: [embed],
                ...(vinyl ? { files: [vinyl] } : {}),
                components: [
                    createMusicControlButtons(queue),
                    createMusicActionButtons(queue),
                ],
            },
        })

        debugLog({
            message: skipCurrent
                ? 'track added to top and current skipped'
                : 'track added to top of queue',
            data: { query, guildId: interaction.guildId },
        })
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            debugLog({
                message: `${commandName} interaction expired before reply`,
                data: { query, guildId: interaction.guildId },
            })
            return
        }

        errorLog({
            message: `${commandName} error:`,
            error,
            data: { query, guildId: interaction.guildId },
        })

        try {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Play Error',
                            createUserFriendlyError(error),
                        ),
                    ],
                    ephemeral: true,
                },
            })
        } catch (replyError) {
            warnLog({
                message: `failed to send ${commandName} error reply`,
                error: replyError,
                data: { guildId: interaction.guildId },
            })
        }
    }
}
