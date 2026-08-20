import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { assertDefined } from '@lucky/shared/utils/guards'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    buildTrackEmbed,
    playerTrackToData,
} from '../../../utils/general/responseEmbeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireQueue,
    requireCurrentTrack,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

function buildProgressBar(posMs: number, durMs: number): string {
    const length = 18
    if (!durMs || durMs <= 0) return `${'▬'.repeat(length)}◉`
    const ratio = Math.min(posMs / durMs, 1)
    const filled = Math.round(ratio * length)
    const bar =
        '▬'.repeat(filled) + '◉' + '─'.repeat(Math.max(0, length - filled))
    const toClock = (ms: number): string => {
        const secs = Math.floor(ms / 1000)
        return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`
    }
    return `${bar}\n\`${toClock(posMs)} / ${toClock(durMs)}\``
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('songinfo')
        .setDescription(
            '🎶 Mostra informações da música que está tocando agora.',
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        const track = queue?.currentTrack

        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return

        const trackData = playerTrackToData(
            assertDefined(
                track,
                'track present after requireCurrentTrack guard',
            ),
        )
        // Snapshot the current playback position as a progress bar with
        // elapsed/total timecodes. Null for livestreams / no-duration tracks.
        const progressBar = track?.durationMS
            ? buildProgressBar(queue?.node.streamTime ?? 0, track.durationMS)
            : null
        const embed = buildTrackEmbed(
            trackData,
            'playing',
            {
                tag: interaction.user.username,
                displayAvatarURL: interaction.user.displayAvatarURL,
            },
            { progressBar },
        )

        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })
    },
})
