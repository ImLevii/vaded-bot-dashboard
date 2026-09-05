import util from 'node:util'
import { Manager } from '../../manager.js'
import Fastify from 'fastify'

export async function queueClear(
  client: Manager,
  req: Fastify.FastifyRequest,
  res: Fastify.FastifyReply
) {
  client.logger.info('QueueClearRouterService', `${req.method} ${req.routeOptions.url}`)

  const guildId = (req.params as Record<string, string>)['guildId']
  const player = client.rainlink.players.get(guildId)
  if (!player) {
    res.code(400)
    res.send({ error: 'Current player not found!' })
    return
  }

  player.queue.clear()
  res.send({ cleared: true })
}
