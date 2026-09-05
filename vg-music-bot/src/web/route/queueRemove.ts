import util from 'node:util'
import { Manager } from '../../manager.js'
import Fastify from 'fastify'

export async function queueRemove(
  client: Manager,
  req: Fastify.FastifyRequest,
  res: Fastify.FastifyReply
) {
  client.logger.info(
    'QueueRemoveRouterService',
    `${req.method} ${req.routeOptions.url} payload=${req.body ? util.inspect(req.body) : '{}'}`
  )

  const guildId = (req.params as Record<string, string>)['guildId']
  const player = client.rainlink.players.get(guildId)
  if (!player) {
    res.code(400)
    res.send({ error: 'Current player not found!' })
    return
  }

  const index = (req.body as { index?: number } | undefined)?.index
  if (typeof index !== 'number' || index < 0 || index >= player.queue.length) {
    res.code(400)
    res.send({ error: 'index out of queue range' })
    return
  }

  player.queue.remove(index)
  res.send({ index })
}
