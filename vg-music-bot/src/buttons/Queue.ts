import { queueEmbeds } from '../utilities/QueueEmbeds.js'
import { PageQueue } from '../structures/PageQueue.js'
import { ButtonInteraction, CacheType, InteractionCollector, Message } from 'discord.js'
import { PlayerButton } from '../@types/Button.js'
import { Manager } from '../manager.js'
import { RainlinkPlayer } from 'rainlink'

export default class implements PlayerButton {
  name = 'queue'
  async run(
    client: Manager,
    message: ButtonInteraction<CacheType>,
    language: string,
    player: RainlinkPlayer,
    nplaying: Message<boolean>,
    collector?: InteractionCollector<ButtonInteraction<'cached'>>
  ): Promise<any> {
    if (!player) {
      collector?.stop()
      return
    }
    const { pages, duration } = queueEmbeds(client, player, language, message.guild!.name)
    if (pages.length > 1)
      return new PageQueue(client, pages, 60000, player.queue.length, language).buttonPage(
        message,
        duration
      )
    return message.reply({ embeds: [pages[0]], ephemeral: true })
  }
}
