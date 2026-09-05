import type { Manager } from '../manager.js'
import { metadata, safeUrl } from './MusicFormatting.js'

export function getTitle(client: Manager, track?: { title?: string; uri?: string }) {
  const title = metadata(track?.title)
  const uri = safeUrl(track?.uri)
  // Long URLs would crowd out the rest of a queue page.
  if (client.config.player.AVOID_SUSPEND || !uri || uri.length > 160) return title
  return `[${title}](${uri})`
}
