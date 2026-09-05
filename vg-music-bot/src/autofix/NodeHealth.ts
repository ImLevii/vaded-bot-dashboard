import type { LavalinkDataType } from '../@types/Lavalink.js'
import { endpointKey, isUsNode } from './UsNodeRegistry.js'

export interface NodeHealthResult {
  node: LavalinkDataType
  online: boolean
  reason?: 'location' | 'http' | 'version' | 'unreachable'
}

export async function checkNodeHealth(
  node: LavalinkDataType,
  request: typeof fetch = fetch,
  timeoutMs = 5000
): Promise<NodeHealthResult> {
  if (!isUsNode(node)) return { node, online: false, reason: 'location' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await request(`${endpointKey(node)}/v4/info`, {
      headers: { Authorization: node.pass },
      signal: controller.signal,
      redirect: 'error',
    })
    if (!response.ok) return { node, online: false, reason: 'http' }
    const info = (await response.json()) as {
      version?: { major?: number }
      sourceManagers?: unknown
    }
    if (info?.version?.major !== 4 || !Array.isArray(info.sourceManagers))
      return { node, online: false, reason: 'version' }
    return { node, online: true }
  } catch {
    return { node, online: false, reason: 'unreachable' }
  } finally {
    clearTimeout(timeout)
  }
}
