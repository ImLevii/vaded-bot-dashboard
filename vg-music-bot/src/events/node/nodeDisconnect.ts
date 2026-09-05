import { destroyDisconnectedPlayers } from '../../autofix/DisconnectedPlayers.js'
import {
  forgetNode,
  coolDownNode,
  isRateLimited,
  removeNode,
} from '../../autofix/NodeConnection.js'
import { Manager } from '../../manager.js'
import { RainlinkNode } from 'rainlink'

export default class {
  execute(client: Manager, node: RainlinkNode, code: number, reason: Buffer) {
    if (client.rainlink.nodes.get(node.options.name) !== node) return
    forgetNode(client, node.options.name)
    node.driver.sessionId = null
    if (isRateLimited(code, reason)) {
      coolDownNode(client, node.options)
      removeNode(client, node.options.name)
      client.logger.warn(
        'NodeDisconnect',
        'Lavalink rejected connection attempts; this endpoint will wait 30 minutes before retrying.'
      )
    }
    destroyDisconnectedPlayers(client, node)
    client.logger.debug(
      'NodeDisconnect',
      `Lavalink ${node.options.name}: Disconnected, Code: ${code}, Reason: ${reason}`
    )
  }
}
