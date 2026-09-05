import type { Manager } from '../manager.js'
import type { RainlinkPlayer } from 'rainlink'
import { MusicEmbed } from './MusicEmbed.js'
import { formatDuration } from './FormatDuration.js'
import { getTitle } from './GetTitle.js'
import { artwork, isLive, metadata, progressBar, requester, youtubeId } from './MusicFormatting.js'

export function nowPlayingEmbed(
  client: Manager,
  player: RainlinkPlayer,
  language: string
): MusicEmbed {
  const song = player.queue.current
  const label = (key: string) => String(client.i18n.get(language, 'event.player', key))
  if (!song)
    return new MusicEmbed()
      .setColor(client.color)
      .setDescription(String(client.i18n.get(language, 'error', 'no_player')))
  const live = isLive(song)
  const embed = new MusicEmbed()
    .setAuthor({
      name: String(client.i18n.get(language, 'command.music', 'np_title')),
      iconURL: String(client.i18n.get(language, 'command.music', 'np_icon')),
    })
    .setColor(client.color)
    .setDescription(`**${getTitle(client, song)}**`)
    .setThumbnail(artwork(song, client.user?.displayAvatarURL()))
    .addFields(
      { name: label('author_title'), value: metadata(song.author), inline: true },
      { name: label('duration_title'), value: formatDuration(song.duration, live), inline: true },
      { name: label('volume_title'), value: `${player.volume}%`, inline: true },
      { name: label('queue_title'), value: String(player.queue.length), inline: true },
      {
        name: label('total_duration_title'),
        value: formatDuration(player.queue.duration),
        inline: true,
      },
      { name: label('request_title'), value: requester(song.requester), inline: true }
    )
  const id = youtubeId(song)
  if (id)
    embed.addFields({
      name: label('download_title'),
      value: `**[${metadata(song.title)}](https://www.000tube.com/watch?v=${id})**`,
      inline: false,
    })
  return embed
    .addFields({
      name: String(
        client.i18n.get(language, 'command.music', 'np_current_duration', {
          current_duration: formatDuration(player.position),
          total_duration: formatDuration(song.duration, live),
        })
      ),
      value: progressBar(player.position, song.duration, live),
      inline: false,
    })
    .setTimestamp()
}
