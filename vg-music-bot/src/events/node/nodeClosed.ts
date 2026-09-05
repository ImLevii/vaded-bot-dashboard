import { forgetNode, wasRemoved } from '../../autofix/NodeConnection.js'
import { AutoFixLavalink } from '../../autofix/AutoFixLavalink.js'
import { Manager } from '../../manager.js'
import { RainlinkNode } from 'rainlink'

export default class {
  async execute(client: Manager, node: RainlinkNode) {
    if (client.rainlink.nodes.get(node.options.name) !== node) return
    forgetNode(client, node.options.name)
    client.logger.debug('NodeClosed', `Lavalink ${node.options.name}: Closed`)
    if (!wasRemoved(node) && client.config.utilities.AUTOFIX_LAVALINK.enable) {
      await new AutoFixLavalink(client, node.options.name).execute()
    }
  }
}
