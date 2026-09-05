import type { Manager } from '../manager.js'
import type { RainlinkNode } from 'rainlink'
import type { LavalinkDataType } from '../@types/Lavalink.js'
import { checkNodeHealth } from './NodeHealth.js'
import { endpointKey, isUsNode } from './UsNodeRegistry.js'

const removedNodes = new WeakSet<RainlinkNode>()

export function wasRemoved(node: RainlinkNode): boolean {
  return removedNodes.has(node)
}

export function removeNode(client: Manager, name: string): void {
  const node = client.rainlink.nodes.get(name)
  if (node) removedNodes.add(node)
  forgetNode(client, name)
  client.rainlink.nodes.remove(name)
}

const confirmations = new WeakMap<RainlinkNode, Promise<boolean>>()

// Rainlink emits nodeConnect on socket open, before Lavalink sends its ready
// payload. Wait for the session ID before making a node available to commands.
export function confirmNodeConnection(client: Manager, node: RainlinkNode): Promise<boolean> {
  const pending = confirmations.get(node)
  if (pending) return pending
  const work = new Promise<boolean>((resolve) => {
    let elapsed = 0
    const check = () => {
      if (
        !isUsNode(node.options) ||
        wasRemoved(node) ||
        client.rainlink.nodes.get(node.options.name) !== node ||
        !node.online
      ) {
        resolve(false)
      } else if (node.driver.sessionId) {
        rememberNode(client, node)
        resolve(true)
      } else if (elapsed >= 5000) {
        removeNode(client, node.options.name)
        resolve(false)
      } else {
        elapsed += 25
        setTimeout(check, 25)
      }
    }
    check()
  }).finally(() => confirmations.delete(node))
  confirmations.set(node, work)
  return work
}

const connections = new WeakMap<Manager, Map<string, Promise<boolean>>>()

export function forgetNode(client: Manager, name: string): void {
  client.lavalinkUsing = client.lavalinkUsing.filter((node) => node.name !== name)
}

export function rememberNode(client: Manager, node: RainlinkNode): void {
  if (!isUsNode(node.options) || wasRemoved(node)) return
  forgetNode(client, node.options.name)
  client.lavalinkUsing.push({
    name: node.options.name,
    host: node.options.host,
    port: node.options.port,
    secure: Boolean(node.options.secure),
    pass: node.options.auth,
  })
}

export function connectUsNode(client: Manager, candidate: LavalinkDataType): Promise<boolean> {
  if (!isUsNode(candidate) || !client.user || client.rainlink.id !== client.user.id)
    return Promise.resolve(false)
  let pending = connections.get(client)
  if (!pending) connections.set(client, (pending = new Map()))
  const key = endpointKey(candidate)
  const existing = pending.get(key)
  if (existing) return existing
  const work = connect(client, candidate).finally(() => pending!.delete(key))
  pending.set(key, work)
  return work
}

async function connect(client: Manager, candidate: LavalinkDataType): Promise<boolean> {
  const active = client.lavalinkUsing.find((node) => endpointKey(node) === endpointKey(candidate))
  if (active) return true
  const duplicate = client.rainlink.nodes
    .all()
    .find(
      (node) =>
        endpointKey(node.options) === endpointKey(candidate) || node.options.name === candidate.name
    )
  if (duplicate) return false
  if (!(await checkNodeHealth(candidate)).online) return false
  // A different endpoint may have claimed this name while the health check ran.
  if (client.rainlink.nodes.get(candidate.name)) return false
  return new Promise<boolean>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const cleanup = () => {
      clearTimeout(timer)
      client.rainlink.off('nodeConnect', connected)
      client.rainlink.off('nodeClosed', closed)
    }
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      cleanup()
      if (!ok) {
        forgetNode(client, candidate.name)
        removeNode(client, candidate.name)
      }
      resolve(ok)
    }
    const matches = (node: RainlinkNode) =>
      node.options.name === candidate.name && endpointKey(node.options) === endpointKey(candidate)
    const connected = (node: RainlinkNode) => {
      if (!matches(node)) return
      void confirmNodeConnection(client, node).then(finish)
    }
    const closed = (node: RainlinkNode) => {
      if (matches(node)) finish(false)
    }
    client.rainlink.on('nodeConnect', connected)
    client.rainlink.on('nodeClosed', closed)
    const { retryCount, retryTimeout } = client.config.utilities.AUTOFIX_LAVALINK
    const attempts = Number.isFinite(retryCount) ? Math.max(0, retryCount) : 10
    const delay = Number.isFinite(retryTimeout) ? Math.max(0, retryTimeout) : 3000
    timer = setTimeout(() => finish(false), Math.min(120000, (attempts + 1) * (delay + 5000)))
    try {
      client.rainlink.nodes.add({
        host: candidate.host,
        port: candidate.port,
        auth: candidate.pass,
        secure: candidate.secure,
        name: candidate.name,
        driver: 'lavalink@4',
      })
    } catch {
      finish(false)
    }
  })
}
