import type { Manager } from '../manager.js'
import type { GlobalMsg } from '../structures/CommandHandler.js'
import type { RainlinkPlayer } from 'rainlink'
import { nowPlayingEmbed } from './NowPlayingEmbed.js'

export function stopNowPlaying(client: Manager, guildId: string): void {
  const current = client.nowPlaying.get(guildId)
  if (current) clearInterval(current.interval)
  client.nowPlaying.delete(guildId)
}

export function startNowPlaying(
  client: Manager,
  player: RainlinkPlayer,
  language: string,
  message: GlobalMsg,
  delay = 5000
): void {
  if (!message) return
  stopNowPlaying(client, player.guildId)
  let editing = false
  const interval = setInterval(async () => {
    if (editing) return
    if (client.rainlink.players.get(player.guildId) !== player || !player.queue.current) {
      stopNowPlaying(client, player.guildId)
      return
    }
    editing = true
    try {
      await message.edit({ content: ' ', embeds: [nowPlayingEmbed(client, player, language)] })
    } catch {
      if (client.nowPlaying.get(player.guildId)?.interval === interval)
        stopNowPlaying(client, player.guildId)
    } finally {
      editing = false
    }
  }, delay)
  client.nowPlaying.set(player.guildId, { interval, msg: message })
}
