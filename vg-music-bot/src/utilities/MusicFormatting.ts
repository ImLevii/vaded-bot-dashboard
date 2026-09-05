import { escapeMarkdown } from 'discord.js'

export function truncate(value: string, limit: number): string {
  if (limit <= 0) return ''
  if (value.length <= limit) return value
  // Never split a UTF-16 surrogate pair.
  let end = Math.max(0, limit - 1)
  if (end && /[\uD800-\uDBFF]/.test(value[end - 1])) end--
  return value.slice(0, end) + '…'
}

export function metadata(value: unknown, fallback = 'Unknown', limit = 160): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  const escaped = escapeMarkdown(text || fallback)
    .replace(/[\[\]]/g, (character) => '\\' + character)
    .replace(/@/g, '@\u200b')
  return truncate(escaped, limit).replace(/\\+$/, '')
}

export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    return url.href.replace(/\(/g, '%28').replace(/\)/g, '%29')
  } catch {
    return null
  }
}

type TrackDisplay = {
  title?: string
  uri?: string
  identifier?: string
  source?: string
  artworkUrl?: string
  duration?: number
  isStream?: boolean
  requester?: unknown
}

export function youtubeId(track?: TrackDisplay): string | null {
  if (!track) return null
  let youtube = track.source?.toLowerCase() === 'youtube'
  try {
    const host = new URL(track.uri || '').hostname.toLowerCase()
    youtube ||= host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')
  } catch {}
  return youtube && /^[\w-]{11}$/.test(track.identifier || '') ? track.identifier! : null
}

export function artwork(track?: TrackDisplay, fallback?: string): string | null {
  const id = youtubeId(track)
  return (
    safeUrl(track?.artworkUrl) ||
    (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : safeUrl(fallback))
  )
}

export function requester(value: unknown): string {
  if (value && typeof value === 'object' && 'id' in value && /^\d{17,20}$/.test(String(value.id)))
    return `<@${value.id}>`
  if (typeof value === 'string' && /^<@!?\d{17,20}>$/.test(value)) return value
  return metadata(
    typeof value === 'object' && value && 'username' in value ? value.username : value
  )
}

export function isLive(track?: TrackDisplay): boolean {
  return Boolean(
    track?.isStream ||
    track?.duration === Infinity ||
    (track?.duration !== undefined && track.duration > 3600000000)
  )
}

export function progressBar(position: number, duration?: number, live = false): string {
  if (live) return '🔴 Live'
  if (!Number.isFinite(duration) || !duration || duration <= 0) return '—'
  const ratio = Number.isFinite(position) ? Math.min(1, Math.max(0, position / duration)) : 0
  const part = Math.floor(ratio * 30)
  return `\`\`\`🔴 | ${'─'.repeat(part)}🎶${'─'.repeat(30 - part)}\`\`\``
}

export function limitLines(lines: string[], limit: number): string {
  const result: string[] = []
  for (const line of lines) {
    if ([...result, line].join('\n').length > limit - 2) {
      if (!result.length) result.push(truncate(line, limit))
      else result.push('…')
      break
    }
    result.push(line)
  }
  return truncate(result.join('\n'), limit)
}
