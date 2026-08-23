import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js'
import { Manager } from '../../manager.js'
import { Accessableby, Command } from '../../structures/Command.js'
import { CommandHandler } from '../../structures/CommandHandler.js'
import {
  TUNEIN_CATEGORIES,
  TUNEIN_MUSIC_GENRES,
  TuneInStation,
  US_STATES,
  browseTuneIn,
  browseTuneInByGenre,
  browseTuneInByState,
  resolveStream,
  searchTuneIn,
} from '../../utilities/RadioStations.js'
import { AutocompleteInteractionChoices, GlobalInteraction } from '../../@types/Interaction.js'

const GUIDE_ID_REGEX = /^[sefpt]\d+$/i
const PAGE_SIZE = 10

/** In-memory browser state keyed by message ID */
interface BrowserState {
  stations: TuneInStation[]
  page: number
  context: string // e.g. "Music", "Jazz", "Texas", etc.
  source: string // e.g. "Category", "Genre", "State", "Search"
}
const browserStates = new Map<string, BrowserState>()

export default class implements Command {
  public name = ['radio']
  public description = 'Play live radio stations — powered by TuneIn'
  public category = 'Music'
  public accessableby = [Accessableby.Member]
  public usage = '[station name]'
  public aliases = ['ra']
  public lavalink = true
  public playerCheck = false
  public usingInteraction = true
  public sameVoiceCheck = false
  public permissions = []
  public options = [
    {
      name: 'station',
      description: 'Search for a radio station (type to search TuneIn live)',
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: true,
    },
  ]

  // ─── Execute ────────────────────────────────────────────────────────────────
  public async execute(client: Manager, handler: CommandHandler) {
    await handler.deferReply()

    const player = client.rainlink.players.get(handler.guild!.id)
    const query = handler.args.join(' ').trim()

    if (!query) return this.sendBrowser(client, handler)

    // Autocomplete packs value as "guideId:stationName"
    let guideId = ''
    let stationName = query

    if (query.includes(':') && GUIDE_ID_REGEX.test(query.split(':')[0])) {
      const sep = query.indexOf(':')
      guideId = query.slice(0, sep)
      stationName = query.slice(sep + 1)
    } else if (GUIDE_ID_REGEX.test(query)) {
      guideId = query
    }

    if (!guideId) {
      const results = await searchTuneIn(query, 1)
      if (!results.length)
        return handler.editReply({
          embeds: [
            new EmbedBuilder()
              .setDescription(`❌ No stations found for **${query}**. Use \`/radio\` to browse.`)
              .setColor(client.color),
          ],
        })
      guideId = results[0].guideId
      stationName = results[0].name
    }

    const streamUrl = await resolveStream(guideId)
    if (!streamUrl)
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `❌ Could not resolve stream for **${stationName}**.\nThe station may be offline — try another with \`/radio\`.`
            )
            .setColor(client.color),
        ],
      })

    return this.play(client, handler, streamUrl, stationName, player)
  }

  // ─── Player ─────────────────────────────────────────────────────────────────
  private async play(
    client: Manager,
    handler: CommandHandler,
    streamUrl: string,
    stationName: string,
    player: any
  ) {
    const { channel } = handler.member!.voice
    if (!channel)
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'error', 'no_in_voice'))
            .setColor(client.color),
        ],
      })

    if (!player)
      player = await client.rainlink.create({
        guildId: handler.guild!.id,
        voiceId: handler.member!.voice.channel!.id,
        textId: handler.channel!.id,
        shardId: handler.guild?.shardId ?? 0,
        deaf: true,
        volume: client.config.player.DEFAULT_VOLUME,
      })
    else if (!this.checkSameVoice(client, handler, handler.language)) return

    player.textId = handler.channel!.id

    const result = await player.search(streamUrl, { requester: handler.user })

    if (!result?.tracks?.length)
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `❌ Lavalink couldn't load the direct stream for **${stationName}**.\nThe station may be offline or the stream format is incompatible — try another with \`/radio\`.`
            )
            .setColor(client.color),
        ],
      })

    const track = result.tracks[0]
    if (player.playing) player.queue.add(track)
    else {
      player.queue.add(track)
      player.play()
    }

    if (handler.message) await handler.message.delete().catch(() => null)

    const embed = new EmbedBuilder()
      .setColor(client.color)
      .setTitle('📻  Now Live on TuneIn')
      .addFields(
        { name: '📡  Station', value: `**${stationName}**`, inline: true },
        { name: '🔊  Track', value: track.title ?? 'Live Stream', inline: true },
        { name: '🌐  Source', value: '[TuneIn Radio](https://tunein.com)', inline: true }
      )
      .setThumbnail(track.artworkUrl ?? null)
      .setFooter({
        text: `Requested by ${handler.user?.username ?? 'Unknown'}`,
        iconURL: handler.user?.displayAvatarURL(),
      })
      .setTimestamp()

    handler.editReply({ content: ' ', embeds: [embed] })
  }

  // ─── Genre Browser ──────────────────────────────────────────────────────────
  private async sendBrowser(client: Manager, handler: CommandHandler) {
    const loading = new EmbedBuilder().setColor(client.color).setDescription('📡  Loading TuneIn…')
    const msg = await handler.editReply({
      embeds: [loading],
      components: [
        this.buildCategoryRow(false),
        this.buildGenreRow(false),
        this.buildStateRow(false, 0),
        this.buildNavRow(false, 0, 1),
      ],
    })

    // Initial load — top music stations
    const initial = await browseTuneIn('music', 50)
    const state: BrowserState = { stations: initial, page: 0, context: 'Music', source: 'Category' }
    browserStates.set(msg.id, state)

    await msg.edit({
      embeds: [this.buildPageEmbed(msg.id)],
      components: [
        this.buildCategoryRow(false),
        this.buildGenreRow(false),
        this.buildStateRow(false, 0),
        this.buildNavRow(false, 0, Math.ceil(initial.length / PAGE_SIZE)),
      ],
    })

    // ── Select Menu collector ─────────────────────────────────────────────────
    const selectCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120000,
    })

    selectCollector.on('collect', async (interaction) => {
      try {
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('📡  Loading…')],
          components: [
            this.buildCategoryRow(false),
            this.buildGenreRow(false),
            this.buildStateRow(false, 0),
            this.buildNavRow(true, 0, 1),
          ],
        })
      } catch {
        return
      }

      const val = interaction.values[0]
      const s = browserStates.get(msg.id)!
      let stations: TuneInStation[]
      let context: string
      let source: string

      if (TUNEIN_CATEGORIES.some((c) => c.value === val)) {
        // Category menu
        stations = await browseTuneIn(val as any, 50)
        context = TUNEIN_CATEGORIES.find((c) => c.value === val)?.label ?? val
        source = 'Category'
      } else if (TUNEIN_MUSIC_GENRES.map((g) => g.toLowerCase()).includes(val.toLowerCase())) {
        // Genre menu
        stations = await browseTuneInByGenre(val, 50)
        context = val.charAt(0).toUpperCase() + val.slice(1)
        source = 'Genre'
      } else {
        // State menu
        stations = await browseTuneInByState(val, 50)
        context = val
        source = 'State'
      }

      s.stations = stations
      s.page = 0
      s.context = context
      s.source = source

      const totalPages = Math.ceil(stations.length / PAGE_SIZE) || 1
      await msg
        .edit({
          embeds: [this.buildPageEmbed(msg.id)],
          components: [
            this.buildCategoryRow(false),
            this.buildGenreRow(false),
            this.buildStateRow(false, 0),
            this.buildNavRow(false, 0, totalPages),
          ],
        })
        .catch(() => null)
    })

    // ── Button collector (pagination) ─────────────────────────────────────────
    const btnCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
    })

    btnCollector.on('collect', async (interaction) => {
      try {
        await interaction.deferUpdate()
      } catch {
        return
      }

      const s = browserStates.get(msg.id)
      if (!s) return
      if (interaction.customId === 'tunein_prev' && s.page > 0) s.page--
      else if (interaction.customId === 'tunein_next') {
        const maxPage = Math.ceil(s.stations.length / PAGE_SIZE) - 1
        if (s.page < maxPage) s.page++
      }

      const totalPages = Math.ceil(s.stations.length / PAGE_SIZE) || 1
      await msg
        .edit({
          embeds: [this.buildPageEmbed(msg.id)],
          components: [
            this.buildCategoryRow(false),
            this.buildGenreRow(false),
            this.buildStateRow(false, 0),
            this.buildNavRow(false, s.page, totalPages),
          ],
        })
        .catch(() => null)
    })

    const onEnd = async () => {
      selectCollector.removeAllListeners()
      btnCollector.removeAllListeners()
      browserStates.delete(msg.id)
      await msg
        .edit({
          components: [
            this.buildCategoryRow(true),
            this.buildGenreRow(true),
            this.buildStateRow(true, 0),
            this.buildNavRow(true, 0, 1),
          ],
        })
        .catch(() => null)
    }

    selectCollector.on('end', onEnd)
    btnCollector.on('end', onEnd)
  }

  // ─── Embed builder ──────────────────────────────────────────────────────────
  private buildPageEmbed(msgId: string): EmbedBuilder {
    const s = browserStates.get(msgId)
    if (!s) return new EmbedBuilder().setColor(0x2b2d31).setDescription('Session expired.')

    const totalPages = Math.ceil(s.stations.length / PAGE_SIZE) || 1
    const pageStations = s.stations.slice(s.page * PAGE_SIZE, (s.page + 1) * PAGE_SIZE)

    if (!pageStations.length)
      return new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('📻  TuneIn Radio')
        .setDescription('No stations found. Try a different category, genre, or state.')

    const lines = pageStations.map((st, i) => {
      const idx = s.page * PAGE_SIZE + i + 1
      const reliability = st.reliability !== '?' ? `✅ ${st.reliability}%` : ''
      const bitrate = st.bitrate !== '?' ? `📡 ${st.bitrate}k` : ''
      const meta = [bitrate, reliability].filter(Boolean).join('  ')
      return [
        `\`${String(idx).padStart(2, ' ')}\`  **${st.name}**`,
        st.subtext ? `\u00a0\u00a0\u00a0\u00a0*${st.subtext}*` : '',
        meta ? `\u00a0\u00a0\u00a0\u00a0${meta}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })

    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📻  TuneIn — ${s.context}`)
      .setDescription(lines.join('\n\n'))
      .addFields(
        { name: '🗂️  Source', value: s.source, inline: true },
        { name: '📄  Page', value: `${s.page + 1} / ${totalPages}`, inline: true },
        { name: '📊  Stations', value: `${s.stations.length} loaded`, inline: true }
      )
      .setFooter({ text: 'Type /radio station:<name> to tune in  ·  Powered by TuneIn' })
  }

  // ─── Component builders ─────────────────────────────────────────────────────
  private buildCategoryRow(disabled: boolean) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('tunein_category')
        .setPlaceholder('📂  Browse by category…')
        .addOptions(
          TUNEIN_CATEGORIES.map((c) =>
            new StringSelectMenuOptionBuilder().setLabel(`${c.emoji}  ${c.label}`).setValue(c.value)
          )
        )
        .setDisabled(disabled)
    )
  }

  private buildGenreRow(disabled: boolean) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('tunein_genre')
        .setPlaceholder('🎵  Browse by music genre…')
        .addOptions(
          TUNEIN_MUSIC_GENRES.slice(0, 25).map((g) =>
            new StringSelectMenuOptionBuilder().setLabel(g).setValue(g.toLowerCase())
          )
        )
        .setDisabled(disabled)
    )
  }

  private buildStateRow(disabled: boolean, page: number) {
    // Discord: max 25 options per menu
    // Show first 25 states (A–M); can expand with a second menu if needed
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('tunein_state')
        .setPlaceholder('🗺️  Browse by US state…')
        .addOptions(
          US_STATES.slice(0, 25).map((state) =>
            new StringSelectMenuOptionBuilder().setLabel(state).setValue(state)
          )
        )
        .setDisabled(disabled)
    )
  }

  private buildNavRow(disabled: boolean, page: number, totalPages: number) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tunein_prev')
        .setLabel('◀  Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page === 0),
      new ButtonBuilder()
        .setCustomId('tunein_next')
        .setLabel('Next  ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page >= totalPages - 1)
    )
  }

  // ─── Autocomplete ────────────────────────────────────────────────────────────
  async autocomplete(client: Manager, interaction: GlobalInteraction, language: string) {
    const raw = String((interaction as any).options.get('station')?.value ?? '').trim()

    const results = raw.length >= 1 ? await searchTuneIn(raw, 25) : await browseTuneIn('music', 25)

    const choices: AutocompleteInteractionChoices[] = results.slice(0, 25).map((s) => {
      const label =
        `${s.name}${s.subtext ? ` — ${s.subtext}` : ''}${s.bitrate !== '?' ? ` [${s.bitrate}k]` : ''}`.slice(
          0,
          100
        )
      const value = `${s.guideId}:${s.name}`.slice(0, 100)
      return { name: label, value }
    })

    await (interaction as AutocompleteInteraction).respond(choices).catch(() => {})
  }

  // ─── Helper ─────────────────────────────────────────────────────────────────
  checkSameVoice(client: Manager, handler: CommandHandler, language: string) {
    if (handler.member!.voice.channel !== handler.guild!.members.me!.voice.channel) {
      handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'error', 'no_same_voice'))
            .setColor(client.color),
        ],
      })
      return false
    }
    return true
  }
}
