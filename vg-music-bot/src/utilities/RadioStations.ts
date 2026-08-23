/**
 * RadioStations.ts — TuneIn OPML API Service
 * Same backend used by Discord's TuneIn Radio & Podcasts Activity.
 * No API key required.
 */

const OPML_BASE = 'https://opml.radiotime.com'
const TUNEIN_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36',
}

export interface TuneInStation {
  name: string
  guideId: string
  subtext: string
  bitrate: string
  formats: string
  reliability: string
  tuneUrl: string
}

interface OPMLItem {
  type?: string
  text?: string
  URL?: string
  guide_id?: string
  subtext?: string
  bitrate?: string
  formats?: string
  reliability?: string
}

interface OPMLResponse {
  head?: { status?: string }
  body?: OPMLItem[]
}

function mapItem(item: OPMLItem): TuneInStation | null {
  if (item.type !== 'audio' || !item.guide_id || !item.URL) return null
  return {
    name: item.text ?? 'Unknown',
    guideId: item.guide_id,
    subtext: item.subtext ?? '',
    bitrate: item.bitrate ?? '?',
    formats: item.formats ?? 'mp3',
    reliability: item.reliability ?? '?',
    tuneUrl: item.URL,
  }
}

async function opmlSearch(query: string, limit = 50): Promise<TuneInStation[]> {
  try {
    const params = new URLSearchParams({ query, render: 'json', formats: 'mp3,aac' })
    const res = await fetch(`${OPML_BASE}/Search.ashx?${params}`, { headers: TUNEIN_HEADERS })
    if (!res.ok) return []
    const json = (await res.json()) as OPMLResponse
    return (json.body ?? [])
      .map(mapItem)
      .filter((s): s is TuneInStation => s !== null)
      .slice(0, limit)
  } catch {
    return []
  }
}

/** Live station search by name */
export async function searchTuneIn(query: string, limit = 25): Promise<TuneInStation[]> {
  return opmlSearch(query, limit)
}

// Category → search query map.
// Browse.ashx returns type=link sub-categories, not audio — use Search instead.
const CATEGORY_QUERIES: Record<string, string> = {
  music: 'top music radio hits',
  news: 'news talk radio USA',
  sports: 'sports radio ESPN USA',
  talk: 'talk radio shows USA',
  local: 'local radio stations AM FM',
  podcast: 'popular podcast audio',
}

/** Browse TuneIn by top-level category */
export async function browseTuneIn(
  category: keyof typeof CATEGORY_QUERIES,
  limit = 50
): Promise<TuneInStation[]> {
  return opmlSearch(CATEGORY_QUERIES[category] ?? category, limit)
}

/** Browse TuneIn by music genre (e.g. "jazz", "hip hop") */
export async function browseTuneInByGenre(genre: string, limit = 50): Promise<TuneInStation[]> {
  return opmlSearch(`${genre} radio live`, limit)
}

/** Browse TuneIn by US state (e.g. "Texas", "New York") */
export async function browseTuneInByState(state: string, limit = 50): Promise<TuneInStation[]> {
  return opmlSearch(`${state} radio station`, limit)
}

/**
 * Resolve a TuneIn guide ID → direct playable stream URL.
 * Tries JSON response first, falls back to plain-text parsing.
 */
export async function resolveStream(guideId: string): Promise<string | null> {
  let streamUrl: string | null = null

  // Try JSON response first
  try {
    const url = `${OPML_BASE}/Tune.ashx?id=${encodeURIComponent(guideId)}&formats=mp3,aac&render=json`
    const res = await fetch(url, { headers: TUNEIN_HEADERS })
    if (res.ok) {
      const ct = res.headers.get('content-type') ?? ''
      if (ct.includes('json')) {
        const json = (await res.json()) as OPMLResponse
        const body = json.body?.[0] as any
        const parsedUrl: string | undefined = body?.url ?? body?.URL
        if (parsedUrl?.startsWith('http')) streamUrl = parsedUrl
      } else {
        const text = await res.text()
        const line = text
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('http'))
        if (line) streamUrl = line
      }
    }
  } catch {}

  // Fallback: without render=json (e.g. if it returns a PLS directly)
  if (!streamUrl) {
    try {
      const url = `${OPML_BASE}/Tune.ashx?id=${encodeURIComponent(guideId)}&formats=mp3,aac`
      const res = await fetch(url, { headers: TUNEIN_HEADERS, redirect: 'follow' })
      if (res.ok) {
        if (res.url.includes('id=')) {
          // Still a tunein internal URL?
          const text = await res.text()
          const line = text
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.startsWith('http'))
          if (line) streamUrl = line
        } else {
          streamUrl = res.url
        }
      }
    } catch {}
  }

  // Recursive Resolution: Follow .ashx, .pls, or .m3u until we hit a raw audio stream
  for (let i = 0; i < 5; i++) {
    if (!streamUrl) break
    const low = streamUrl.toLowerCase()

    // If it already looks like a raw stream, we're likely done
    if (
      low.endsWith('.mp3') ||
      low.endsWith('.aac') ||
      low.endsWith('.asx') ||
      low.endsWith('.m4a')
    )
      break

    try {
      const res = await fetch(streamUrl, { headers: TUNEIN_HEADERS })
      if (!res.ok) break

      const ct = res.headers.get('content-type') ?? ''
      const text = await res.text()
      const lines = text.split('\n').map((l) => l.trim())

      if (low.includes('.pls') || ct.includes('scpls') || text.includes('File1=')) {
        const fileLine = lines.find((l) => l.toLowerCase().startsWith('file1='))
        if (fileLine) streamUrl = fileLine.split('=')[1]
        else break
      } else if (
        low.includes('.m3u') ||
        low.includes('.ashx') ||
        ct.includes('mpegurl') ||
        lines.some((l) => l.startsWith('http'))
      ) {
        const m3uLine = lines.find((l) => l.startsWith('http'))
        if (m3uLine) streamUrl = m3uLine
        else break
      } else {
        // Assume it's a direct stream if it redirects or we reach here
        if (res.url !== streamUrl) streamUrl = res.url
        break
      }
    } catch {
      break
    }
  }

  return streamUrl
}

/** TuneIn top-level categories */
export const TUNEIN_CATEGORIES = [
  { label: 'Music', value: 'music', emoji: '🎵' },
  { label: 'News', value: 'news', emoji: '📰' },
  { label: 'Sports', value: 'sports', emoji: '🏆' },
  { label: 'Talk', value: 'talk', emoji: '🎙️' },
  { label: 'Local', value: 'local', emoji: '📍' },
  { label: 'Podcast', value: 'podcast', emoji: '🎧' },
]

/** Music sub-genres */
export const TUNEIN_MUSIC_GENRES = [
  'Pop',
  'Hip Hop',
  'Country',
  'Rock',
  'Classic Rock',
  'Electronic',
  'EDM',
  'Jazz',
  'Blues',
  'Classical',
  'R&B',
  'Soul',
  'Latin',
  'Reggae',
  'Metal',
  'Punk',
  'Indie',
  'Lofi',
  'Oldies',
  'Gospel',
  'Christian',
]

/** US States (Top 25 by population to fit Discord's Select Menu limit, ensuring Wisconsin is included) */
export const US_STATES = [
  'California',
  'Texas',
  'Florida',
  'New York',
  'Pennsylvania',
  'Illinois',
  'Ohio',
  'Georgia',
  'North Carolina',
  'Michigan',
  'New Jersey',
  'Virginia',
  'Washington',
  'Arizona',
  'Massachusetts',
  'Tennessee',
  'Indiana',
  'Maryland',
  'Missouri',
  'Wisconsin',
  'Colorado',
  'Minnesota',
  'South Carolina',
  'Alabama',
  'Louisiana',
]
