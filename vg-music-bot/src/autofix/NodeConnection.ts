import { destroyDisconnectedPlayers } from './DisconnectedPlayers.js'
import type { Manager } from '../manager.js'
import type { RainlinkNode } from 'rainlink'
import type { LavalinkDataType } from '../@types/Lavalink.js'
import { checkNodeHealth } from './NodeHealth.js'
import { endpointKey, isUsNode } from './UsNodeRegistry.js'

export const USA_UNAVAILABLE = 'No healthy USA Lavalink servers available'
export const NODE_COOLDOWN_MS = 30 * 60 * 1000
const cooldowns = new WeakMap<Manager, Map<string, number>>()
const removedNodes = new WeakSet<RainlinkNode>()

export function nodeCooldownRemaining(
  client: Manager,
  node: Parameters<typeof endpointKey>[0]
): number {
  const key = endpointKey(node)
  const remaining = (cooldowns.get(client)?.get(key) ?? 0) - Date.now()
  if (remaining <= 0) cooldowns.get(client)?.delete(key)
  return Math.max(0, remaining)
}

export function coolDownNode(client: Manager, node: Parameters<typeof endpointKey>[0]): void {
  let entries = cooldowns.get(client)
  if (!entries) cooldowns.set(client, (entries = new Map()))
  entries.set(endpointKey(node), Date.now() + NODE_COOLDOWN_MS)
}

export function isRateLimited(code: number, reason: Buffer | string): boolean {
  return code === 1013 || /too many|rate.?limit|try again later/i.test(String(reason))
}

function isAvailableUsNode(client: Manager, node: RainlinkNode): boolean {
  return Boolean(
    node &&
    node.online &&
    node.driver.sessionId &&
    !wasRemoved(node) &&
    client.rainlink.nodes.get(node.options.name) === node &&
    isUsNode(node.options) &&
    !nodeCooldownRemaining(client, node.options) &&
    client.lavalinkUsing.some(
      (entry) =>
        entry.name === node.options.name && endpointKey(entry) === endpointKey(node.options)
    )
  )
}

export function hasAvailableUsNode(client: Manager): boolean {
  return client.rainlink.nodes.all().some((node) => isAvailableUsNode(client, node))
}

// Rainlink's default resolver treats socket-open as ready. Returning undefined
// would fall back to that resolver, so reject explicitly if no session qualifies.
export function selectAvailableUsNode(client: Manager, nodes: RainlinkNode[]): RainlinkNode {
  const eligible = nodes.filter((node) => isAvailableUsNode(client, node))
  if (!eligible.length) throw new Error(USA_UNAVAILABLE)
  return eligible.sort((left, right) => (left.stats?.players ?? 0) - (right.stats?.players ?? 0))[0]
}

export function isNoNodesError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /no nodes? (?:are )?(?:online|available)|no healthy USA Lavalink/i.test(error.message)
  )
}

export function wasRemoved(node: RainlinkNode): boolean {
  return removedNodes.has(node)
}

export function removeNode(client: Manager, name: string): void {
  const node = client.rainlink.nodes.get(name)
  forgetNode(client, name)
  if (!node) return
  if (node) {
    removedNodes.add(node)
    // Rainlink may already be sleeping before a reconnect. Removal must also
    // prevent that deferred callback from reconnecting the discarded instance.
    node.reconnect = () => {}
    node.online = false
    node.driver.sessionId = null
  }
  destroyDisconnectedPlayers(client, node)
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
  if (
    !isUsNode(candidate) ||
    nodeCooldownRemaining(client, candidate) ||
    !client.user ||
    client.rainlink.id !== client.user.id
  )
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
  const activeNode = active && client.rainlink.nodes.get(active.name)
  if (activeNode && isAvailableUsNode(client, activeNode)) return true
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
      client.rainlink.off('nodeDisconnect', disconnected)
    }
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      cleanup()
      if (!ok) {
        coolDownNode(client, candidate)
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
    const disconnected = (node: RainlinkNode, code: number, reason: Buffer) => {
      if (matches(node) && isRateLimited(code, reason)) finish(false)
    }
    client.rainlink.on('nodeDisconnect', disconnected)
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
