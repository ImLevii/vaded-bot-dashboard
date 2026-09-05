import { forgetNode } from '../../autofix/NodeConnection.js'
import { Manager } from '../../manager.js'
import { RainlinkNode } from 'rainlink'

export default class {
  execute(client: Manager, node: RainlinkNode, code: number, reason: Buffer) {
    if (client.rainlink.nodes.get(node.options.name) !== node) return
    forgetNode(client, node.options.name)
    client.rainlink.players.forEach((player, index) => {
      if (player.node.options.name == node.options.name) player.destroy().catch(() => {})
    })
    client.logger.debug(
      'NodeDisconnect',
      `Lavalink ${node.options.name}: Disconnected, Code: ${code}, Reason: ${reason}`
    )
  }
}
