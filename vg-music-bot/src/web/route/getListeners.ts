import util from 'node:util'
import { VoiceChannel } from 'discord.js'
import { Manager } from '../../manager.js'
import Fastify from 'fastify'

export async function getListeners(
  client: Manager,
  req: Fastify.FastifyRequest,
  res: Fastify.FastifyReply
) {
  client.logger.info(
    'StatusRouterService',
    `${req.method} ${req.routeOptions.url} params=${req.params ? util.inspect(req.params) : '{}'}`
  )
  const guildId = (req.params as Record<string, string>)['guildId']
  const player = client.rainlink.players.get(guildId)
  if (!player) {
    res.code(400)
    res.send({ error: 'Current player not found!' })
    return
  }

  if (!player.voiceId) {
    res.send({ data: [] })
    return
  }

  const voiceChannel = (await client.channels.fetch(player.voiceId).catch(() => undefined)) as
    VoiceChannel | undefined

  if (!voiceChannel) {
    res.send({ data: [] })
    return
  }

  res.send({
    data: voiceChannel.members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      avatarUrl: member.displayAvatarURL(),
      isBot: member.user.bot,
    })),
  })
}
