import util from 'node:util'
import { Manager } from '../../../manager.js'
import Fastify from 'fastify'

export async function switchNode(
  client: Manager,
  req: Fastify.FastifyRequest,
  res: Fastify.FastifyReply
) {
  client.logger.info(
    'LavalinkNodesRouterService',
    `${req.method} ${req.routeOptions.url} params=${JSON.stringify(req.params)} payload=${req.body ? util.inspect(req.body) : '{}'}`
  )

  const targetNodeName = (req.params as Record<string, string>)['name']
  const guildId = (req.body as Record<string, string> | undefined)?.guildId

  if (!guildId) {
    res.code(400)
    res.send({ error: 'Missing guildId key' })
    return
  }

  const targetNode = client.rainlink.nodes.get(targetNodeName)
  if (!targetNode || !targetNode.online) {
    res.code(400)
    res.send({ error: 'Target node not found or not online' })
    return
  }

  const player = client.rainlink.players.get(guildId)
  if (!player) {
    res.code(400)
    res.send({ error: 'Current player not found for this guild' })
    return
  }

  if (player.node.options.name === targetNodeName) {
    res.code(400)
    res.send({ error: 'Player is already using this node' })
    return
  }

  const snapshot = {
    voiceId: player.voiceId!,
    textId: player.textId,
    shardId: player.shardId,
    deaf: player.deaf,
    volume: player.volume,
    loop: player.loop,
    paused: player.paused,
    position: player.position,
    current: player.queue.current,
    remaining: [...player.queue],
  }

  await player.destroy()

  const newPlayer = await client.rainlink.create({
    guildId,
    voiceId: snapshot.voiceId,
    textId: snapshot.textId,
    shardId: snapshot.shardId,
    deaf: snapshot.deaf,
    volume: snapshot.volume,
    nodeName: targetNodeName,
  })

  newPlayer.setLoop(snapshot.loop)
  if (snapshot.remaining.length !== 0) newPlayer.queue.add(snapshot.remaining)
  if (snapshot.current)
    await newPlayer.play(snapshot.current, {
      position: snapshot.position,
      pause: snapshot.paused,
    })

  res.send({ guildId, node: targetNodeName })
}
