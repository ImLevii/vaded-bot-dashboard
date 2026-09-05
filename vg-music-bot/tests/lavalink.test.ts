import { getNodes } from '../src/web/route/lavalink/getNodes.js'
import { ConfigDataService } from '../src/services/ConfigDataService.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { GetLavalinkServer, parseCatalog, CATALOG_URL } from '../src/autofix/GetLavalinkServer.js'
import { US_SEED_NODES, US_NODE_REGISTRY, isUsNode } from '../src/autofix/UsNodeRegistry.js'
import { checkNodeHealth } from '../src/autofix/NodeHealth.js'
import { CheckLavalinkServer } from '../src/autofix/CheckLavalinkServer.js'
import {
  connectUsNode,
  rememberNode,
  forgetNode,
  removeNode,
  wasRemoved,
} from '../src/autofix/NodeConnection.js'
import { AutoFixLavalink } from '../src/autofix/AutoFixLavalink.js'
import { postNode } from '../src/web/route/lavalink/postNode.js'
import Disconnect from '../src/events/node/nodeDisconnect.js'
import Closed from '../src/events/node/nodeClosed.js'

const seed = { ...US_SEED_NODES[0] }
const entry = {
  host: seed.host,
  port: seed.port,
  password: 'http://test/!@#$%^&*():p',
  secure: false,
  version: 'v4',
}
const info = () => Response.json({ version: { major: 4 }, sourceManagers: ['youtube', 'http'] })
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function client(autoConnect = true): any {
  const nodes = new Map<string, any>()
  const rainlink = new EventEmitter() as any
  rainlink.id = '123456789012345678'
  rainlink.players = new Map()
  rainlink.nodes = {
    get: (name: string) => nodes.get(name),
    all: () => [...nodes.values()],
    add: (options: any) => {
      const node = { options, online: false, driver: { sessionId: null } }
      nodes.set(options.name, node)
      if (autoConnect)
        queueMicrotask(() => {
          node.online = true
          node.driver.sessionId = 'session' as any
          rainlink.emit('nodeConnect', node)
        })
      return node
    },
    remove: (name: string) => nodes.delete(name),
  }
  return {
    user: { id: rainlink.id },
    rainlink,
    config: {
      player: { NODES: [] },
      utilities: { AUTOFIX_LAVALINK: { enable: true, retryCount: 0, retryTimeout: 0 } },
    },
    lavalinkList: [],
    lavalinkUsing: [],
    logger: { info() {}, warn() {}, debug() {} },
  }
}

test('catalog accepts v4, preserves password punctuation, rejects malformed rows and deduplicates', () => {
  const result = parseCatalog([
    entry,
    { ...entry, host: entry.host.toUpperCase() },
    { ...entry, version: 'v3' },
    { ...entry, port: '2031' },
    { ...entry, port: -1 },
    { ...entry, secure: 'false' },
    { ...entry, host: 'http://bad' },
    { ...entry, password: '' },
    null,
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].pass, entry.password)
  assert.equal(result[0].online, false)
  assert.throws(() => parseCatalog({ error: 'bad gateway' }))
})

test('catalog failures reject explicitly and requests have a cancellation signal', async () => {
  await assert.rejects(
    new GetLavalinkServer((async (_url, options) => {
      assert.ok(options?.signal)
      return new Response('bad gateway', { status: 502 })
    }) as typeof fetch).execute(),
    /HTTP 502/
  )
  await assert.rejects(
    new GetLavalinkServer((async () => new Response('not json')) as typeof fetch).execute()
  )
})

test('catalog and REST timeout abort pending requests', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const pendingFetch: typeof fetch = (_url, options) =>
    new Promise((_resolve, reject) =>
      options!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    )
  const catalog = new GetLavalinkServer(pendingFetch, 10).execute()
  const rejection = assert.rejects(catalog, /aborted/)
  t.mock.timers.tick(10)
  await rejection
  const health = checkNodeHealth(seed, pendingFetch, 10)
  t.mock.timers.tick(10)
  assert.equal((await health).online, false)
})

test('country admission matches the complete reviewed endpoint', () => {
  assert.equal(isUsNode(seed), true)
  assert.equal(isUsNode({ ...seed, host: 'us-east.unknown.test' }), false)
  assert.equal(isUsNode({ ...seed, port: 443 }), false)
  assert.equal(isUsNode({ ...seed, secure: true }), false)
  assert.equal(isUsNode({ ...seed, host: 'omega.vexanode.cloud.evil.test' }), false)
})

test('REST probes reject unknown countries without contacting them', async () => {
  let calls = 0
  const result = await checkNodeHealth({ ...seed, host: 'unknown.test' }, (async () => {
    calls++
    return info()
  }) as typeof fetch)
  assert.equal(result.reason, 'location')
  assert.equal(calls, 0)
})

test('REST uses exact authorization and correct TLS scheme and validates v4 info', async () => {
  const secure = { ...seed, host: 'test-us.invalid', secure: true, port: 443 }
  const registry = US_NODE_REGISTRY as any[]
  registry.push({ ...secure, country: 'US', source: 'test fixture', reviewedAt: '2026-09-05' })
  try {
    assert.equal(
      (
        await checkNodeHealth(secure, (async (url, options) => {
          assert.equal(url, 'https://test-us.invalid:443/v4/info')
          assert.equal((options!.headers as any).Authorization, secure.pass)
          assert.equal(options!.redirect, 'error')
          return info()
        }) as typeof fetch)
      ).online,
      true
    )
    assert.equal(
      (
        await checkNodeHealth(seed, (async () =>
          Response.json({
            version: { major: 3 },
            sourceManagers: [],
          })) as typeof fetch)
      ).reason,
      'version'
    )
    assert.equal(
      (await checkNodeHealth(seed, (async () => new Response('', { status: 401 })) as typeof fetch))
        .reason,
      'http'
    )
  } finally {
    registry.pop()
  }
})

test('refresh is shared and publishes results only after health checks finish', async () => {
  const bot = client()
  const old = [{ ...seed, pass: 'previous', online: true }]
  bot.lavalinkList = old
  let release!: (value: any) => void
  let catalogCalls = 0
  const check = new CheckLavalinkServer(
    bot,
    {
      execute: async () => {
        catalogCalls++
        return [seed]
      },
    },
    async (node) =>
      new Promise((resolve) => {
        release = () => resolve({ node, online: true })
      })
  )
  const first = check.execute()
  const second = new CheckLavalinkServer(bot).execute()
  assert.equal(first, second)
  await flush()
  assert.equal(bot.lavalinkList, old)
  release(undefined)
  await first
  assert.equal(catalogCalls, 1)
  assert.notEqual(bot.lavalinkList, old)
  assert.equal(bot.lavalinkList[0].online, true)
})

test('catalog failure rechecks old candidates instead of trusting stale health', async () => {
  const bot = client()
  bot.lavalinkList = [{ ...seed, pass: 'previous', online: true }]
  let password = ''
  await new CheckLavalinkServer(
    bot,
    {
      execute: async () => {
        throw new Error('502')
      },
    },
    async (node) => {
      password = node.pass
      return { node, online: false }
    }
  ).execute()
  assert.equal(password, 'previous')
  assert.equal(bot.lavalinkList[0].online, false)
})

test('connections are shared and only confirmed connections become available', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => info())
  const bot = client(false)
  const first = connectUsNode(bot, seed)
  const second = connectUsNode(bot, seed)
  assert.equal(first, second)
  await flush()
  assert.equal(bot.lavalinkUsing.length, 0)
  const node = bot.rainlink.nodes.get(seed.name)
  node.online = true
  node.driver.sessionId = 'session'
  bot.rainlink.emit('nodeConnect', node)
  assert.equal(await first, true)
  assert.equal(bot.lavalinkUsing.length, 1)
  rememberNode(bot, node)
  assert.equal(bot.lavalinkUsing.length, 1)
  assert.equal(bot.rainlink.listenerCount('nodeConnect'), 0)
  assert.equal(bot.rainlink.listenerCount('nodeClosed'), 0)
})

test('missing bot ID and unreviewed nodes cannot connect', async () => {
  const bot = client()
  bot.user = undefined
  assert.equal(await connectUsNode(bot, seed), false)
  bot.user = { id: 'wrong' }
  assert.equal(await connectUsNode(bot, seed), false)
  bot.user.id = bot.rainlink.id
  assert.equal(await connectUsNode(bot, { ...seed, host: 'unknown.test' }), false)
  assert.equal(bot.rainlink.nodes.all().length, 0)
})

test('connection timeout removes pending node and listeners', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(globalThis, 'fetch', async () => info())
  const bot = client(false)
  const connection = connectUsNode(bot, seed)
  await flush()
  t.mock.timers.tick(5000)
  assert.equal(await connection, false)
  assert.equal(bot.rainlink.nodes.all().length, 0)
  assert.equal(bot.rainlink.listenerCount('nodeConnect'), 0)
  assert.equal(bot.rainlink.listenerCount('nodeClosed'), 0)
  assert.equal(bot.lavalinkUsing.length, 0)
})

test('simultaneous recovery shares discovery and safely handles missing failed names', async (t) => {
  let catalogs = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === CATALOG_URL) {
      catalogs++
      return Response.json([entry])
    }
    return info()
  })
  const bot = client()
  const first = new AutoFixLavalink(bot, 'already-gone').execute()
  const second = new AutoFixLavalink(bot, 'also-gone').execute()
  assert.equal(first, second)
  await first
  assert.equal(catalogs, 1)
  assert.equal(bot.rainlink.nodes.all().length, 1)
  assert.equal(bot.lavalinkUsing.length, 1)
})

test('disconnect and intentional removal keep bookkeeping accurate without replacing deleted nodes', async () => {
  const bot = client(false)
  const node = bot.rainlink.nodes.add({ ...seed, auth: seed.pass })
  rememberNode(bot, node)
  new Disconnect().execute(bot, node, 1006, Buffer.from('closed'))
  assert.equal(bot.lavalinkUsing.length, 0)
  rememberNode(bot, node)
  forgetNode(bot, 'missing')
  assert.equal(bot.lavalinkUsing.length, 1)
  removeNode(bot, seed.name)
  assert.equal(wasRemoved(node), true)
  await new Closed().execute(bot, node)
  assert.equal(bot.lavalinkUsing.length, 0)
  assert.equal(bot.rainlink.nodes.all().length, 0)
})

test('dashboard rejects unknown endpoints and malformed secure flag before any connection', async () => {
  const bot = client()
  for (const body of [
    { name: 'node', host: 'us-but-unverified.test', port: 443, auth: 'password', secure: true },
    { name: 'node', host: seed.host, port: seed.port, auth: 'password', secure: 'false' },
  ]) {
    let code = 200
    let payload: any
    const res: any = {
      code(value: number) {
        code = value
        return this
      },
      send(value: any) {
        payload = value
        return this
      },
    }
    await postNode(bot, { method: 'POST', routeOptions: { url: '/nodes' }, body } as any, res)
    assert.equal(code, 400)
    assert.ok(payload.error)
    assert.equal(bot.rainlink.nodes.all().length, 0)
  }
})

test('socket open without a Lavalink session is not available; ready completes admission', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(globalThis, 'fetch', async () => info())
  const bot = client(false)
  const connection = connectUsNode(bot, seed)
  await flush()
  const node = bot.rainlink.nodes.get(seed.name)
  node.online = true
  bot.rainlink.emit('nodeConnect', node)
  await flush()
  assert.equal(bot.lavalinkUsing.length, 0)
  node.driver.sessionId = 'ready-session'
  t.mock.timers.tick(25)
  assert.equal(await connection, true)
  assert.equal(bot.lavalinkUsing.length, 1)
})

test('socket that never sends ready is removed and never marked available', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(globalThis, 'fetch', async () => info())
  const bot = client(false)
  const connection = connectUsNode(bot, seed)
  await flush()
  const node = bot.rainlink.nodes.get(seed.name)
  node.online = true
  bot.rainlink.emit('nodeConnect', node)
  for (let i = 0; i <= 200; i++) t.mock.timers.tick(25)
  assert.equal(await connection, false)
  assert.equal(bot.lavalinkUsing.length, 0)
  assert.equal(bot.rainlink.nodes.all().length, 0)
  assert.equal(bot.rainlink.listenerCount('nodeConnect'), 0)
})

test('empty configured node list is valid only when automatic discovery is enabled', () => {
  const config = new ConfigDataService()
  const value: any = {
    bot: { TOKEN: 'test-token', OWNER_ID: 'test-owner' },
    player: { NODES: [] },
    utilities: { AUTOFIX_LAVALINK: { enable: true } },
  }
  assert.doesNotThrow(() => config.checkConfig(value))
  value.utilities.AUTOFIX_LAVALINK.enable = false
  assert.throws(() => config.checkConfig(value), /NODES/)
})

test('configured unknown endpoints are excluded and never probed', async () => {
  const bot = client()
  bot.config.player.NODES = [
    { name: 'unknown', host: 'us-unknown.test', port: 443, secure: true, auth: 'password' },
  ]
  const checked: string[] = []
  await new CheckLavalinkServer(bot, { execute: async () => [] }, async (node) => {
    checked.push(node.host)
    return { node, online: false }
  }).execute()
  assert.ok(!checked.includes('us-unknown.test'))
  assert.ok(bot.lavalinkList.every(isUsNode))
})

test('dashboard does not expose socket-open as an available node before ready', async () => {
  const bot = client(false)
  const node = bot.rainlink.nodes.add({ ...seed, auth: seed.pass })
  node.online = true
  node.state = 0
  let response: any
  await getNodes(
    bot,
    { method: 'GET', routeOptions: { url: '/nodes' } } as any,
    {
      send: (value) => {
        response = value
      },
    } as any
  )
  assert.equal(response[0].online, false)
  assert.equal(response[0].state, 'disconnected')
  assert.equal(response[0].stats, null)
})
