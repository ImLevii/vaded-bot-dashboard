import type { Manager } from '../../manager.js'
import { Accessableby, type Command } from '../../structures/Command.js'
import type { CommandHandler } from '../../structures/CommandHandler.js'
import { MusicEmbed } from '../../utilities/MusicEmbed.js'
import { nowPlayingEmbed } from '../../utilities/NowPlayingEmbed.js'
import { startNowPlaying, stopNowPlaying } from '../../utilities/NowPlayingSession.js'

export default class implements Command {
  public name = ['nowplaying']
  public description = 'Display the song currently playing.'
  public category = 'Music'
  public accessableby = [Accessableby.Member]
  public usage = ''
  public aliases = ['np']
  public lavalink = true
  public playerCheck = true
  public usingInteraction = true
  public sameVoiceCheck = false
  public permissions = []
  public options = []

  public async execute(client: Manager, handler: CommandHandler) {
    await handler.deferReply()
    const guildId = handler.guild!.id
    const player = client.rainlink.players.get(guildId)
    if (!player?.queue.current)
      return handler.editReply({
        embeds: [
          new MusicEmbed()
            .setColor(client.color)
            .setDescription(String(client.i18n.get(handler.language, 'error', 'no_player'))),
        ],
      })
    const previous = client.nowPlaying.get(guildId)
    stopNowPlaying(client, guildId)
    await previous?.msg?.delete().catch(() => null)
    const message = await handler.editReply({
      content: ' ',
      embeds: [nowPlayingEmbed(client, player, handler.language)],
    })
    if (client.config.player.NP_REALTIME) startNowPlaying(client, player, handler.language, message)
  }
}
