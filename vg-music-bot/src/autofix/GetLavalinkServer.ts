import type { LavalinkDataType } from '../@types/Lavalink.js'
import { endpointKey } from './UsNodeRegistry.js'

export const CATALOG_URL = 'https://lavalink-list.ajieblogs.eu.org/All'

export interface LavalinkListEntry {
  host: string
  port: number
  password: string
  secure: boolean
  version: string
}

export function parseCatalog(data: unknown): LavalinkDataType[] {
  if (!Array.isArray(data)) throw new Error('Invalid Lavalink catalog: expected an array')
  const nodes = new Map<string, LavalinkDataType>()
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue
    const { host, port, password, secure, version } = entry
    if (
      typeof host !== 'string' ||
      !/^[a-zA-Z0-9.-]+$/.test(host) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      typeof password !== 'string' ||
      !password.length ||
      typeof secure !== 'boolean' ||
      typeof version !== 'string' ||
      !/^v?4(?:\.\d+)*$/i.test(version)
    )
      continue
    const node = {
      host: host.toLowerCase(),
      port,
      pass: password,
      secure,
      name: `${host.toLowerCase()}:${port}`,
      online: false,
    }
    nodes.set(endpointKey(node), node)
  }
  return [...nodes.values()]
}

export class GetLavalinkServer {
  constructor(
    private request: typeof fetch = fetch,
    private timeoutMs = 10000
  ) {}

  async execute(): Promise<LavalinkDataType[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.request(CATALOG_URL, { signal: controller.signal })
      if (!response.ok) throw new Error(`Lavalink catalog HTTP ${response.status}`)
      return parseCatalog(await response.json())
    } finally {
      clearTimeout(timeout)
    }
  }
}
