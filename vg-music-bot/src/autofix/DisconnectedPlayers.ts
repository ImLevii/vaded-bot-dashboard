import type { Manager } from '../manager.js'
import { RainlinkPlayerState, type RainlinkNode, type RainlinkPlayer } from 'rainlink'
import { stopNowPlaying } from '../utilities/NowPlayingSession.js'

// SDK destroy() requires a working REST session before deleting local state.
// A disconnected node cannot provide that session, so finish local teardown
// immediately and let the normal destroy event update messages and 24/7 state.
export function destroyDisconnectedPlayer(client: Manager, player: RainlinkPlayer): void {
  if (client.rainlink.players.get(player.guildId) !== player) return
  client.rainlink.players.delete(player.guildId)
  if (client.rainlink.voices.get(player.guildId) === player.voice) {
    client.rainlink.voices.delete(player.guildId)
  }
  stopNowPlaying(client, player.guildId)
  const leaveTimeout = client.leaveDelay.get(player.guildId)
  if (leaveTimeout) clearTimeout(leaveTimeout)
  client.leaveDelay.delete(player.guildId)
  try {
    player.clear(false)
    // Player.disconnect() also calls pause() against the failed REST session.
    player.voice.disconnect()
  } catch (error) {
    client.logger.warn(
      'PlayerDisconnect',
      'Voice cleanup failed after the disconnected player was removed.'
    )
  } finally {
    player.playing = false
    player.paused = true
    player.voiceId = ''
    player.deaf = false
    player.mute = false
    player.state = RainlinkPlayerState.DESTROYED
  }
  client.rainlink.emit('playerDestroy', player)
}

export function destroyDisconnectedPlayers(client: Manager, node: RainlinkNode): void {
  client.rainlink.players.forEach((player) => {
    if (player.node === node) destroyDisconnectedPlayer(client, player)
  })
}
