import { Manager } from '../../../manager.js'
import Fastify from 'fastify'
import { RainlinkConnectState } from 'rainlink'

const stateName: Record<RainlinkConnectState, string> = {
  [RainlinkConnectState.Connected]: 'connected',
  [RainlinkConnectState.Disconnected]: 'disconnected',
  [RainlinkConnectState.Closed]: 'closed',
}

export async function getNodes(
  client: Manager,
  req: Fastify.FastifyRequest,
  res: Fastify.FastifyReply
) {
  client.logger.info('LavalinkNodesRouterService', `${req.method} ${req.routeOptions.url}`)

  const ready = new Set(client.lavalinkUsing.map((node) => node.name))

  res.send(
    client.rainlink.nodes.all().map((node) => ({
      name: node.options.name,
      host: node.options.host,
      port: node.options.port,
      secure: node.options.secure,
      driver: node.options.driver ?? null,
      online: node.online && ready.has(node.options.name),
      state:
        node.online && !ready.has(node.options.name)
          ? 'disconnected'
          : (stateName[node.state] ?? 'unknown'),
      stats:
        node.online && ready.has(node.options.name)
          ? {
              players: node.stats.players,
              playingPlayers: node.stats.playingPlayers,
              uptime: node.stats.uptime,
              memoryUsed: node.stats.memory.used,
              memoryReservable: node.stats.memory.reservable,
              cpuCores: node.stats.cpu.cores,
              cpuSystemLoad: node.stats.cpu.systemLoad,
              cpuLavalinkLoad: node.stats.cpu.lavalinkLoad,
            }
          : null,
    }))
  )
}
