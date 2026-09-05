import { Manager } from '../../manager.js'
import { TextChannel } from 'discord.js'
import { ClearMessageService } from '../../services/ClearMessageService.js'
import { AutoReconnectBuilderService } from '../../services/AutoReconnectBuilderService.js'
import { RainlinkPlayer, RainlinkPlayerState, RainlinkTrack } from 'rainlink'
import { insertTrackHistory } from '../../db/postgres.js'
import { formatDuration } from '../../utilities/FormatDuration.js'

export default class {
  async execute(client: Manager, player: RainlinkPlayer, track: RainlinkTrack) {
    if (!client.isDatabaseConnected)
      return client.logger.warn(
        'DatabaseService',
        'The database is not yet connected so this event will temporarily not execute. Please try again later!'
      )

    const guild = await client.guilds.fetch(player.guildId).catch(() => undefined)
    client.logger.info('TrackEnd', `Track ended in @ ${guild!.name} / ${player.guildId}`)

    insertTrackHistory({
      guildId: player.guildId,
      trackId: track.identifier,
      title: track.title,
      author: track.author,
      duration: formatDuration(track.duration),
      url: track.uri ?? '',
      thumbnail: track.artworkUrl,
      source: track.source,
      playedBy: (track.requester as { id?: string } | null)?.id ?? null,
      playDuration: null,
      skipped: false,
    }).catch((err) => client.logger.error('TrackHistoryService', err))

    /////////// Update Music Setup //////////
    await client.UpdateMusic(player)
    /////////// Update Music Setup ///////////

    client.emit('playerEnd', player)

    const data = await new AutoReconnectBuilderService(client, player).get(player.guildId)
    const channel = (await client.channels
      .fetch(player.textId)
      .catch(() => undefined)) as TextChannel
    if (channel) {
      if (data && data.twentyfourseven) return

      if (player.queue.length || player!.queue!.current)
        return new ClearMessageService(client, channel, player)

      if (player.loop !== 'none') return new ClearMessageService(client, channel, player)
    }

    const currentPlayer = client.rainlink.players.get(player.guildId) as RainlinkPlayer
    if (!currentPlayer) return
    if (!currentPlayer.sudoDestroy) await player.destroy().catch(() => {})
  }
}
