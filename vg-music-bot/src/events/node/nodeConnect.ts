import { confirmNodeConnection, wasRemoved } from '../../autofix/NodeConnection.js'
import { Manager } from '../../manager.js'
import { RainlinkNode } from 'rainlink'

export default class {
  async execute(client: Manager, node: RainlinkNode) {
    if (wasRemoved(node)) return
    if (!(await confirmNodeConnection(client, node))) return

    client.logger.info('NodeConnect', `Lavalink [${node.options.name}] connected.`)
  }
}
