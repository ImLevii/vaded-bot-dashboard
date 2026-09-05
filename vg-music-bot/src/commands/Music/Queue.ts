import { MusicEmbed as EmbedBuilder } from '../../utilities/MusicEmbed.js'
import { queueEmbeds } from '../../utilities/QueueEmbeds.js'
import { ApplicationCommandOptionType } from 'discord.js'
import { PageQueue } from '../../structures/PageQueue.js'
import { Manager } from '../../manager.js'
import { Accessableby, Command } from '../../structures/Command.js'
import { CommandHandler } from '../../structures/CommandHandler.js'
import { RainlinkPlayer } from 'rainlink'

// Main code
export default class implements Command {
  public name = ['queue']
  public description = 'Show the queue of songs.'
  public category = 'Music'
  public accessableby = [Accessableby.Member]
  public usage = '<page_number>'
  public aliases = []
  public lavalink = true
  public playerCheck = true
  public usingInteraction = true
  public sameVoiceCheck = true
  public permissions = []
  public options = [
    {
      name: 'page',
      description: 'Page number to show.',
      type: ApplicationCommandOptionType.Number,
      required: false,
    },
  ]

  public async execute(client: Manager, handler: CommandHandler) {
    await handler.deferReply()

    const value = handler.args[0]

    if (value && isNaN(+value))
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`${client.i18n.get(handler.language, 'error', 'number_invalid')}`)
            .setColor(client.color),
        ],
      })

    const player = client.rainlink.players.get(handler.guild!.id) as RainlinkPlayer

    const { pages, duration: qduration } = queueEmbeds(
      client,
      player,
      handler.language,
      handler.guild!.name
    )
    const pagesNum = pages.length

    if (!value) {
      if (pages.length == pagesNum && player.queue.length > 10) {
        if (handler.message) {
          await new PageQueue(
            client,
            pages,
            60000,
            player.queue.length,
            handler.language
          ).prefixPage(handler.message, qduration)
        } else if (handler.interaction) {
          await new PageQueue(
            client,
            pages,
            60000,
            player.queue.length,
            handler.language
          ).slashPage(handler.interaction, qduration)
        } else return
      } else return handler.editReply({ embeds: [pages[0]] })
    } else {
      if (isNaN(+value))
        return handler.editReply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                `${client.i18n.get(handler.language, 'command.music', 'queue_notnumber')}`
              )
              .setColor(client.color),
          ],
        })
      if (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > pagesNum)
        return handler.editReply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                `${client.i18n.get(handler.language, 'command.music', 'queue_page_notfound', {
                  page: String(pagesNum),
                })}`
              )
              .setColor(client.color),
          ],
        })
      const pageNum = Number(value) - 1
      return handler.editReply({ embeds: [pages[pageNum]] })
    }
  }
}
