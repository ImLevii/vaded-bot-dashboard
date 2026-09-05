import { RainlinkPlayer, RainlinkVoice, RainlinkDatabase, RainlinkPlayerState } from 'rainlink'
import { destroyDisconnectedPlayer } from '../src/autofix/DisconnectedPlayers.js'
import { deleteNode } from '../src/web/route/lavalink/deleteNode.js'
import PlayerDestroy from '../src/events/player/playerDestroy.js'
import { RainlinkInit } from '../src/structures/Rainlink.js'
import { getStatus } from '../src/web/route/getStatus.js'
import { PostCreatePlayer } from '../src/web/route/postCreatePlayer.js'
import { getSearch } from '../src/web/route/getSearch.js'
import Play from '../src/commands/Music/Play.js'
import { AutoCompleteService } from '../src/services/AutoCompleteService.js'
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
  nodeCooldownRemaining,
  NODE_COOLDOWN_MS,
  hasAvailableUsNode,
  USA_UNAVAILABLE,
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
  rainlink.voices = new Map()
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
    nowPlaying: new Map(),
    leaveDelay: new Map(),
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
  const releases: (() => void)[] = []
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
        releases.push(() => resolve({ node, online: true }))
      })
  )
  const first = check.execute()
  const second = new CheckLavalinkServer(bot).execute()
  assert.equal(first, second)
  await flush()
  assert.equal(bot.lavalinkList, old)
  for (const release of releases) release()
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
      if (node.host === seed.host) password = node.pass
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

function reply() {
  return {
    statusCode: 200,
    payload: undefined as any,
    code(value: number) {
      this.statusCode = value
      return this
    },
    send(value: any) {
      this.payload = value
      return this
    },
  }
}

function readyNode(bot: any) {
  const node = bot.rainlink.nodes.add({ ...seed, auth: seed.pass })
  node.online = true
  node.driver.sessionId = 'ready-session'
  rememberNode(bot, node)
  return node
}

test('rate-limited sockets stop immediately, suppress pending reconnects, and wait 30 minutes', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => info())
  let now = 1000
  t.mock.method(Date, 'now', () => now)
  const bot = client(false)
  const connection = connectUsNode(bot, seed)
  await flush()
  const node = bot.rainlink.nodes.get(seed.name)
  let reconnects = 0
  node.reconnect = () => {
    reconnects++
  }
  node.online = true
  bot.rainlink.emit('nodeConnect', node)
  new Disconnect().execute(
    bot,
    node,
    4000,
    Buffer.from('Too many websocket connections attempt for this bot, try again later')
  )
  bot.rainlink.emit('nodeDisconnect', node, 4000, Buffer.from('Too many websocket connections'))
  assert.equal(await connection, false)
  node.reconnect(true)
  assert.equal(reconnects, 0)
  assert.equal(bot.rainlink.nodes.all().length, 0)
  assert.equal(bot.lavalinkUsing.length, 0)
  assert.equal(nodeCooldownRemaining(bot, seed), NODE_COOLDOWN_MS)
  assert.equal(await connectUsNode(bot, seed), false)
  assert.equal(bot.rainlink.listenerCount('nodeDisconnect'), 0)
  now += NODE_COOLDOWN_MS
  assert.equal(nodeCooldownRemaining(bot, seed), 0)
  bot.rainlink.nodes.add = (options: any) => {
    const ready = { options, online: true, driver: { sessionId: 'new' } }
    bot.rainlink.nodes.get = () => ready
    queueMicrotask(() => bot.rainlink.emit('nodeConnect', ready))
    return ready
  }
  assert.equal(await connectUsNode(bot, seed), true)
})

test('disconnect clears a previous session so a reconnect must receive a new ready payload', async () => {
  const bot = client(false)
  const node = readyNode(bot)
  assert.equal(hasAvailableUsNode(bot), true)
  new Disconnect().execute(bot, node, 1006, Buffer.from('network interrupted'))
  assert.equal(node.driver.sessionId, null)
  assert.equal(hasAvailableUsNode(bot), false)
  rememberNode(bot, node)
  assert.equal(hasAvailableUsNode(bot), false)
})

test('dashboard status distinguishes an idle guild from unavailable USA servers', async () => {
  const bot = client(false)
  const req: any = {
    method: 'GET',
    routeOptions: { url: '/players/:guildId' },
    params: { guildId: 'guild' },
    headers: {},
  }
  const unavailable = reply()
  await getStatus(bot, req, unavailable as any)
  assert.equal(unavailable.statusCode, 503)
  assert.equal(unavailable.payload.error, USA_UNAVAILABLE)
  readyNode(bot)
  const idle = reply()
  await getStatus(bot, req, idle as any)
  assert.equal(idle.statusCode, 400)
  assert.equal(idle.payload.error, 'Current player not found!')
})

test('dashboard player creation awaits Rainlink and returns 503 when the last node disappears', async () => {
  const bot = client(false)
  readyNode(bot)
  bot.guilds = {
    fetch: async () => ({
      id: 'guild',
      shardId: 0,
      members: { fetch: async () => ({ voice: { channel: { id: 'voice' } } }) },
    }),
  }
  let release!: () => void
  bot.rainlink.create = () =>
    new Promise((_resolve, reject) => {
      release = () => reject(new Error('No nodes are online'))
    })
  const res = reply()
  const router = new PostCreatePlayer(bot)
  const work = router.main(
    {
      method: 'POST',
      routeOptions: { url: '/players' },
      body: { guildId: 'guild', userId: 'user' },
    } as any,
    res as any
  )
  await flush()
  assert.equal(res.payload, undefined)
  release()
  await work
  assert.equal(res.statusCode, 503)
  assert.equal(res.payload.error, USA_UNAVAILABLE)
  assert.equal(router.guild, null)
})

test('dashboard search reports unavailable USA nodes without invoking Rainlink search', async () => {
  const bot = client(false)
  bot.users = { fetch: async () => undefined }
  bot.rainlink.search = () => {
    throw new Error('Must not search without a ready node')
  }
  const res = reply()
  await getSearch(
    bot,
    { method: 'GET', routeOptions: { url: '/search' }, query: { identifier: 'song' } } as any,
    res as any
  )
  assert.equal(res.statusCode, 503)
  assert.equal(res.payload.error, USA_UNAVAILABLE)
})

test('play autocomplete always responds when nodes are missing or disappear during search', async () => {
  const bot = client(false)
  bot.db = { maxlength: { get: async () => undefined } }
  bot.config.player.AUTOCOMPLETE_SEARCH = ['song']
  bot.REGEX = []
  bot.i18n = { get: () => USA_UNAVAILABLE }
  let responses: any[] = []
  const interaction: any = {
    user: { id: 'user' },
    options: { get: () => ({ value: 'song' }) },
    respond: async (value: any) => {
      responses.push(value)
    },
  }
  await new Play().autocomplete(bot, interaction, 'en')
  assert.equal(responses[0][0].name, USA_UNAVAILABLE)
  readyNode(bot)
  bot.rainlink.search = async () => {
    throw new Error('No nodes are online')
  }
  await new Play().autocomplete(bot, interaction, 'en')
  assert.deepEqual(responses[1], [])
})

test('autocomplete dispatcher catches rejected command promises and acknowledges the interaction', async () => {
  const bot = client(false)
  bot.db = { language: { get: async () => 'en' } }
  let errors = 0
  bot.logger.error = () => {
    errors++
  }
  bot.commands = new Map([
    [
      'play',
      {
        autocomplete: async () => {
          throw new Error('No nodes are online')
        },
      },
    ],
  ])
  let responses = 0
  const interaction: any = {
    commandName: 'play',
    guild: { id: 'guild' },
    responded: false,
    options: { getSubcommand: () => '', getSubcommandGroup: () => '' },
    respond: async (choices: any) => {
      assert.deepEqual(choices, [])
      responses++
    },
  }
  new AutoCompleteService(bot, interaction)
  await flush()
  assert.equal(errors, 1)
  assert.equal(responses, 1)
})

test('reviewed public US seeds retain evidence and are never presumed healthy', () => {
  const tls = US_SEED_NODES.find((node) => node.host === 'lavalinkv4.serenetia.com')!
  assert.equal(tls.secure, true)
  assert.equal(tls.port, 443)
  assert.equal(tls.pass, 'https://seretia.link/discord')
  assert.equal(isUsNode(tls), true)
  assert.equal(isUsNode({ ...tls, port: 80, secure: false }), false)
  assert.ok(US_SEED_NODES.every((node) => node.online === false))
  assert.ok(US_NODE_REGISTRY.every((node) => node.source.startsWith('https://')))
})

test('Rainlink resolver ignores socket-open nodes even when another node is ready', async () => {
  const bot = client(false)
  const ready = readyNode(bot)
  ready.stats = { players: 5 }
  const pending = bot.rainlink.nodes.add({ ...US_SEED_NODES[1], auth: US_SEED_NODES[1].pass })
  pending.online = true
  pending.stats = { players: 0 }
  const resolver = new RainlinkInit(bot).defaultConfig.nodeResolver!
  assert.equal(await resolver(bot.rainlink.nodes.all()), ready)
  await assert.rejects(resolver([pending]), /No healthy USA Lavalink/)
  new Disconnect().execute(bot, ready, 1006, Buffer.from('gone'))
  await assert.rejects(resolver(bot.rainlink.nodes.all()), /No healthy USA Lavalink/)
})

test('play accepts tracks without a configured duration limit and waits for playback rejection', async () => {
  const bot = client(false)
  bot.db = { maxlength: { get: async () => undefined } }
  bot.color = 0xff0000
  bot.i18n = { get: () => 'test' }
  const queue: any = []
  queue.add = (track: any) => queue.push(track)
  queue.duration = 120000
  const player = {
    playing: false,
    queue,
    textId: '',
    search: async () => ({ type: 'SEARCH', tracks: [{ title: 'song', duration: 120000 }] }),
    play: async () => {
      throw new Error('No nodes are online')
    },
  }
  bot.rainlink.create = async () => player
  const handler: any = {
    deferReply: async () => {},
    editReply: async () => {},
    guild: { id: 'guild' },
    user: { id: 'user' },
    language: 'en',
    args: ['song'],
    channel: { id: 'text' },
    member: { voice: { channel: { id: 'voice' } } },
  }
  await assert.rejects(new Play().execute(bot, handler), /No nodes are online/)
  assert.equal(queue.length, 1)
})

function sdkPlayer(bot: any, node: any) {
  bot.rainlink.rainlinkOptions = { options: { defaultVolume: 100 } }
  const packets: any[] = []
  bot.rainlink.library = { sendPacket: (_shard: number, packet: any) => packets.push(packet) }
  node.driver.playerFunctions = new RainlinkDatabase()
  node.rest = {
    updatePlayer: async () => {
      throw new Error('sessionId not initialized')
    },
    destroyPlayer: async () => {
      throw new Error('sessionId not initialized')
    },
  }
  const voice = new RainlinkVoice(bot.rainlink, {
    guildId: 'guild',
    voiceId: 'voice',
    textId: 'text',
    shardId: 0,
  })
  const player = new RainlinkPlayer(bot.rainlink, voice, node)
  player.state = RainlinkPlayerState.CONNECTED
  player.playing = true
  player.queue.current = { title: 'playing track' } as any
  bot.rainlink.players.set(player.guildId, player)
  bot.rainlink.voices.set(player.guildId, voice)
  return { player, voice, packets }
}

test('disconnect tears down actual SDK players locally when destroy cannot reach its session', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
  const bot = client(false)
  const node = readyNode(bot)
  const { player, voice, packets } = sdkPlayer(bot, node)
  let ticks = 0
  const interval = setInterval(() => ticks++, 100)
  const leave = setTimeout(() => ticks++, 100)
  bot.nowPlaying.set('guild', { interval })
  bot.leaveDelay.set('guild', leave)
  let destroyed = 0
  bot.rainlink.on('playerDestroy', (value: any) => {
    assert.equal(value, player)
    destroyed++
  })
  // This is the installed SDK method: it rejects before deleting the player.
  await assert.rejects(player.destroy(), /sessionId not initialized/)
  assert.equal(bot.rainlink.players.get('guild'), player)
  new Disconnect().execute(bot, node, 1006, Buffer.from('network gone'))
  assert.equal(bot.rainlink.players.get('guild'), undefined)
  assert.equal(bot.rainlink.voices.get('guild'), undefined)
  assert.equal(player.state, RainlinkPlayerState.DESTROYED)
  assert.equal(player.queue.current, undefined)
  assert.equal(voice.voiceId, null)
  assert.equal(packets[0].d.channel_id, null)
  assert.equal(destroyed, 1)
  t.mock.timers.tick(500)
  assert.equal(ticks, 0)
  destroyDisconnectedPlayer(bot, player)
  assert.equal(destroyed, 1)
})

test('dashboard node removal deletes associated players without starting dead-session REST work', async () => {
  const bot = client(false)
  const node = readyNode(bot)
  const { player } = sdkPlayer(bot, node)
  let restCalls = 0
  node.rest.updatePlayer = async () => {
    restCalls++
    throw new Error('sessionId not initialized')
  }
  const res = reply()
  await deleteNode(
    bot,
    { method: 'DELETE', routeOptions: { url: '/nodes/:name' }, params: { name: seed.name } } as any,
    res as any
  )
  assert.equal(res.statusCode, 200)
  assert.equal(restCalls, 0)
  assert.equal(bot.rainlink.players.get(player.guildId), undefined)
  assert.equal(bot.rainlink.voices.get(player.guildId), undefined)
  assert.equal(bot.rainlink.nodes.get(seed.name), undefined)
})

test('late cleanup of an old player cannot delete or disconnect its replacement', () => {
  const bot = client(false)
  const node = readyNode(bot)
  const { player: oldPlayer } = sdkPlayer(bot, node)
  const { player: replacement, voice, packets } = sdkPlayer(bot, node)
  destroyDisconnectedPlayer(bot, oldPlayer)
  assert.equal(bot.rainlink.players.get('guild'), replacement)
  assert.equal(bot.rainlink.voices.get('guild'), voice)
  assert.equal(packets.length, 0)
})

test('24/7 destroy event preserves saved voice settings without recreating on an unavailable node', async () => {
  const bot = client(false)
  const node = readyNode(bot)
  const { player } = sdkPlayer(bot, node)
  forgetNode(bot, node.options.name)
  bot.isDatabaseConnected = true
  bot.guilds = { fetch: async () => ({ name: 'guild', shardId: 0 }) }
  bot.channels = { fetch: async () => ({ guild: { id: 'guild' } }) }
  bot.UpdateMusic = async () => {}
  bot.emit = () => {}
  bot.sentQueue = new Map()
  bot.color = 0xff0000
  bot.i18n = { get: () => 'ended' }
  player.data.set('sudo-destroy', true)
  let saved: any = { guild: 'guild', voice: 'voice', text: 'text', twentyfourseven: true }
  bot.db = {
    autoreconnect: {
      get: async () => saved,
      set: async (_guild: string, value: any) => {
        saved = value
      },
      delete: async () => {
        throw new Error('Must preserve 24/7 settings')
      },
    },
    language: { get: async () => 'en' },
    setup: { get: async () => ({ channel: 'text' }) },
  }
  bot.rainlink.players.create = async () => {
    throw new Error('Must not recreate without a healthy node')
  }
  await new PlayerDestroy().execute(bot, player)
  assert.equal(saved.voice, 'voice')
  assert.equal(saved.twentyfourseven, true)
})
