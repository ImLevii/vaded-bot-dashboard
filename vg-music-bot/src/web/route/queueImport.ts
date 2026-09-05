import util from 'node:util'
import { Manager } from '../../manager.js'
import Fastify from 'fastify'

export async function queueImport(
  client: Manager,
  req: Fastify.FastifyRequest,
  res: Fastify.FastifyReply
) {
  client.logger.info(
    'QueueImportRouterService',
    `${req.method} ${req.routeOptions.url} payload=${req.body ? util.inspect(req.body) : '{}'}`
  )

  const guildId = (req.params as Record<string, string>)['guildId']
  const player = client.rainlink.players.get(guildId)
  if (!player) {
    res.code(400)
    res.send({ error: 'Current player not found!' })
    return
  }

  const url = (req.body as { url?: string } | undefined)?.url
  if (!url) {
    res.code(400)
    res.send({ error: 'Missing url key' })
    return
  }

  const result = await player.search(url, { requester: null })
  if (!result.tracks.length) {
    res.code(400)
    res.send({ error: 'No tracks found for this playlist' })
    return
  }

  player.queue.add(result.tracks)
  if (!player.playing) await player.play()

  res.send({ added: result.tracks.length, playlistName: result.playlistName ?? null })
}
