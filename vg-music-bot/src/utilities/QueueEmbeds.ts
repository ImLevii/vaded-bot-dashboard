import type { Manager } from '../manager.js'
import type { RainlinkPlayer } from 'rainlink'
import { MusicEmbed } from './MusicEmbed.js'
import { getTitle } from './GetTitle.js'
import { artwork, requester, metadata, isLive } from './MusicFormatting.js'
import { formatDuration } from './FormatDuration.js'

export function queueEmbeds(
  client: Manager,
  player: RainlinkPlayer,
  language: string,
  guild: string
) {
  const song = player.queue.current
  const duration = formatDuration((song?.duration || 0) + player.queue.duration, isLive(song))
  if (!song)
    return {
      duration,
      pages: [
        new MusicEmbed()
          .setColor(client.color)
          .setDescription(String(client.i18n.get(language, 'error', 'no_player'))),
      ],
    }
  const lines = [...player.queue].map(
    (track, i) =>
      `**${i + 1}.** ${getTitle(client, track)} \`[${formatDuration(track.duration, isLive(track))}]\``
  )
  const count = Math.max(1, Math.ceil(lines.length / 10))
  const pages = Array.from({ length: count }, (_, index) =>
    new MusicEmbed()
      .setAuthor({
        name: String(
          client.i18n.get(language, 'command.music', 'queue_author', {
            guild: metadata(guild),
          })
        ),
      })
      .setColor(client.color)
      .setThumbnail(artwork(song, client.user?.displayAvatarURL()))
      .setDescription(
        String(
          client.i18n.get(language, 'command.music', 'queue_description', {
            title: getTitle(client, song),
            request: requester(song.requester),
            duration: formatDuration(song.duration, isLive(song)),
            rest: lines.slice(index * 10, index * 10 + 10).join('\n') || '  Nothing',
          })
        )
      )
      .setFooter({
        text: String(
          client.i18n.get(language, 'command.music', 'queue_footer', {
            page: String(index + 1),
            pages: String(count),
            queue_lang: String(player.queue.length),
            duration,
          })
        ),
      })
  )
  return { pages, duration }
}
