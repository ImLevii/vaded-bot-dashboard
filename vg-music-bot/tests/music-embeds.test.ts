import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { EmbedBuilder } from 'discord.js'
import { MusicEmbed } from '../src/utilities/MusicEmbed.js'
import {
  metadata,
  artwork,
  progressBar,
  requester,
  limitLines,
} from '../src/utilities/MusicFormatting.js'
import { getTitle } from '../src/utilities/GetTitle.js'
import { formatDuration } from '../src/utilities/FormatDuration.js'
import { nowPlayingEmbed } from '../src/utilities/NowPlayingEmbed.js'
import { queueEmbeds } from '../src/utilities/QueueEmbeds.js'
import { startNowPlaying, stopNowPlaying } from '../src/utilities/NowPlayingSession.js'
import { playerRowOne, playerRowTwo } from '../src/utilities/PlayerControlButton.js'
import { ChannelUpdater } from '../src/setup/ChannelUpdater.js'

const translations = Object.fromEntries(
  ['event.player', 'command.music', 'error', 'event.setup'].map((key) => [
    key,
    load(readFileSync(new URL('../languages/en/' + key + '.yaml', import.meta.url), 'utf8')) as any,
  ])
)
const bot = (): any => ({
  color: '#2b2d31',
  user: { displayAvatarURL: () => 'https://example.com/bot.png' },
  config: {
    player: { AVOID_SUSPEND: false },
    bot: { LANGUAGE: 'en' },
    emojis: {
      PLAYER: {
        stop: '⏹️',
        previous: '⏪',
        pause: '⏸️',
        skip: '⏩',
        loop: '🔁',
        shuffle: '🔀',
        voldown: '🔉',
        delete: '🗑️',
        volup: '🔊',
        queue: '📋',
      },
    },
  },
  i18n: {
    get: (_language: string, section: string, key: string, params: any = {}) =>
      String(translations[section][key]).replace(
        /%\{([^}]+)\}/g,
        (_match, name) => params[name] ?? ''
      ),
  },
  nowPlaying: new Map(),
  rainlink: { players: new Map() },
})
const track = (extra = {}) => ({
  title: 'Example song',
  author: 'Example artist',
  uri: 'https://youtube.com/watch?v=abcdefghijk',
  source: 'youtube',
  identifier: 'abcdefghijk',
  duration: 180000,
  isStream: false,
  requester: { id: '123456789012345678' },
  ...extra,
})
const player = (extra = {}): any => ({
  guildId: 'guild',
  volume: 100,
  position: 45000,
  playing: true,
  queue: Object.assign([], { current: track(), duration: 0 }),
  ...extra,
})

function withinLimits(data: any) {
  assert.ok((data.description?.length || 0) <= 4096)
  assert.ok((data.title?.length || 0) <= 256)
  assert.ok((data.fields?.length || 0) <= 25)
  const total = [
    data.title,
    data.description,
    data.author?.name,
    data.footer?.text,
    ...(data.fields || []).flatMap((f: any) => {
      assert.ok(f.name.length > 0 && f.name.length <= 256)
      assert.ok(f.value.length > 0 && f.value.length <= 1024)
      return [f.name, f.value]
    }),
  ].reduce((sum, text) => sum + (text?.length || 0), 0)
  assert.ok(total <= 6000, String(total))
  new EmbedBuilder(data).toJSON()
}

test('shared builder preserves normal colors, layout, labels and artwork', () => {
  const input = {
    description: '**Song**',
    title: 'Queue',
    color: 0x2b2d31,
    thumbnail: { url: 'https://example.com/art.png' },
    fields: [{ name: '🕒 Duration', value: '03:00', inline: true }],
  }
  assert.deepEqual(new MusicEmbed(input).toJSON(), input)
})

test('oversized descriptions and fields remain within individual and total Discord limits', () => {
  const embed = new MusicEmbed()
    .setColor(0x2b2d31)
    .setTitle('t'.repeat(500))
    .setDescription('x'.repeat(6000))
    .setFooter({ text: 'f'.repeat(3000) })
    .addFields(
      Array.from({ length: 30 }, () => ({ name: 'n'.repeat(300), value: 'v'.repeat(1500) }))
    )
  withinLimits(embed.toJSON())
  assert.ok(embed.toJSON().description!.length > 100)
  assert.equal(embed.toJSON().color, 0x2b2d31)
})

test('metadata is escaped, bounded, and has sensible missing-value fallbacks', () => {
  assert.equal(metadata(undefined), 'Unknown')
  assert.ok(metadata('[bad](url) **bold** @everyone').includes('\\['))
  assert.ok(!metadata('@everyone').includes('@everyone'))
  assert.ok(metadata('🎶'.repeat(300)).length <= 160)
  assert.equal(requester(undefined), 'Unknown')
  assert.equal(requester({ id: '123456789012345678' }), '<@123456789012345678>')
  assert.equal(getTitle(bot(), { title: 'Song', uri: 'javascript:alert(1)' }), 'Song')
})

test('artwork only uses YouTube fallback for YouTube tracks', () => {
  assert.match(artwork(track())!, /img.youtube.com/)
  assert.equal(artwork(track({ source: 'http', uri: 'https://radio.test/live' })), null)
  assert.equal(
    artwork(track({ artworkUrl: 'javascript:bad' }), 'https://example.com/bot.png')?.includes(
      'youtube'
    ),
    true
  )
  assert.equal(
    artwork({ title: 'Radio' }, 'https://example.com/bot.png'),
    'https://example.com/bot.png'
  )
})

test('duration and progress safely handle live, zero, negative, nonfinite and overshoot values', () => {
  for (const duration of [0, -1, NaN, undefined]) assert.equal(formatDuration(duration), '00:00')
  assert.equal(formatDuration(Infinity), 'Live')
  assert.equal(formatDuration(90000000), '25:00:00')
  assert.equal(progressBar(10, 0), '—')
  assert.equal(progressBar(10, 0, true), '🔴 Live')
  assert.equal((progressBar(200, 100).match(/─/g) || []).length, 30)
  assert.equal((progressBar(-100, 100).match(/─/g) || []).length, 30)
  assert.equal((progressBar(NaN, 100).match(/─/g) || []).length, 30)
})

test('now-playing preserves labels and updates all metadata on track changes', () => {
  const client = bot()
  const current = player()
  const first = nowPlayingEmbed(client, current, 'en').toJSON()
  assert.equal(first.color, 0x2b2d31)
  assert.equal(first.author?.name, 'Now Playing')
  assert.equal(first.fields?.[0].name, translations['event.player'].author_title)
  assert.equal(first.fields?.length, 8)
  current.queue.current = track({
    title: 'Live radio',
    author: undefined,
    requester: undefined,
    source: 'http',
    uri: 'https://radio.test/live',
    duration: 0,
    isStream: true,
  })
  const second = nowPlayingEmbed(client, current, 'en').toJSON()
  assert.match(second.description!, /Live radio/)
  assert.equal(second.fields?.length, 7)
  assert.equal(second.fields?.[0].value, 'Unknown')
  assert.equal(second.fields?.[1].value, 'Live')
  assert.equal(second.fields?.at(-1)?.value, '🔴 Live')
  assert.equal(second.thumbnail?.url, 'https://example.com/bot.png')
  withinLimits(second)
})

test('queue covers every track in bounded ten-track pages and handles an empty player', () => {
  const client = bot()
  const current = player()
  current.queue.push(
    ...Array.from({ length: 25 }, (_, i) => track({ title: 'Song ' + i + 'x'.repeat(600) }))
  )
  const { pages } = queueEmbeds(client, current, 'en', 'Guild')
  assert.equal(pages.length, 3)
  pages.forEach((page) => withinLimits(page.toJSON()))
  assert.match(pages[2].toJSON().description!, /\*\*25\./)
  current.queue.current = undefined
  assert.match(
    queueEmbeds(client, current, 'en', 'Guild').pages[0].toJSON().description!,
    /No song/
  )
})

test('setup queue content fits 2000 characters and idle state uses disabled controls', async () => {
  const client = bot()
  const current = player()
  const edits: any[] = []
  client.db = {
    setup: { get: async () => ({ channel: 'channel', playmsg: 'message', enable: true }) },
    language: { get: async () => 'en' },
  }
  client.channels = {
    fetch: async () => ({
      messages: { fetch: async () => ({ edit: async (data) => edits.push(data) }) },
    }),
  }
  client.selectMenuOptions = [{ label: 'Reset', value: 'clear' }]
  new ChannelUpdater(client)
  current.queue.push(...Array.from({ length: 25 }, () => track({ title: 'z'.repeat(2000) })))
  await client.UpdateQueueMsg(current)
  assert.ok(edits[0].content.length <= 2000)
  withinLimits(edits[0].embeds[0].toJSON())
  current.queue.current = undefined
  await client.UpdateQueueMsg(current)
  assert.equal(edits[1].components[1].toJSON().components[0].disabled, true)
  assert.ok(limitLines(['x'.repeat(3000)], 2000).length <= 2000)
})

test('player button IDs, secondary styling and ordering remain unchanged', () => {
  const rows = [playerRowOne(bot(), false), playerRowTwo(bot(), false)].map((row) => row.toJSON())
  assert.deepEqual(
    rows.flatMap((row) => row.components.map((c) => c.custom_id)),
    ['stop', 'replay', 'pause', 'skip', 'loop', 'shuffle', 'voldown', 'clear', 'volup', 'queue']
  )
  assert.ok(rows.every((row) => row.components.every((c) => c.style === 2 && c.disabled === false)))
})

test('realtime redraw follows current track and stops after edit failure or player removal', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const client = bot()
  const current = player()
  client.rainlink.players.set('guild', current)
  const edits: any[] = []
  startNowPlaying(
    client,
    current,
    'en',
    {
      edit: async (data) => {
        edits.push(data)
      },
    } as any,
    10
  )
  assert.equal(client.nowPlaying.size, 1)
  current.queue.current = track({ title: 'Replacement' })
  t.mock.timers.tick(10)
  await Promise.resolve()
  assert.match(edits[0].embeds[0].toJSON().description, /Replacement/)
  client.rainlink.players.delete('guild')
  t.mock.timers.tick(10)
  assert.equal(client.nowPlaying.size, 0)
  client.rainlink.players.set('guild', current)
  startNowPlaying(
    client,
    current,
    'en',
    {
      edit: async () => {
        throw new Error('Unknown message')
      },
    } as any,
    10
  )
  t.mock.timers.tick(10)
  await Promise.resolve()
  assert.equal(client.nowPlaying.size, 0)
  stopNowPlaying(client, 'guild')
})
