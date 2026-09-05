import pg from 'pg'
import { randomUUID } from 'node:crypto'

/**
 * Direct writes into the dashboard's Postgres schema (prisma/schema.prisma
 * in the vaded-bot-dashboard repo), so its track-history/24-7-resume/
 * saved-queue pages keep working now that vg-music-bot (not that repo's
 * own bot) is the one actually playing music. Uses `pg` directly rather
 * than the dashboard's generated Prisma client — vg-music-bot isn't part
 * of that pnpm workspace, so pulling Prisma in would mean duplicating its
 * schema/build pipeline for four simple tables.
 */

let pool: pg.Pool | null = null

function getPool(): pg.Pool | null {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) return null
  if (!pool) pool = new pg.Pool({ connectionString })
  return pool
}

export interface SnapshotTrack {
  title: string
  uri: string | null
  identifier: string
  author: string
  duration: number
  artworkUrl: string | null
  source: string
}

export async function insertTrackHistory(entry: {
  guildId: string
  trackId: string
  title: string
  author: string
  duration: string
  url: string
  thumbnail: string | null
  source: string
  playedBy: string | null
  playDuration: number | null
  skipped: boolean
}): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO track_history
      (id, "guildId", "trackId", title, author, duration, url, thumbnail, source, "playedAt", "playedBy", "playDuration", skipped)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, $11, $12)`,
    [
      randomUUID(),
      entry.guildId,
      entry.trackId,
      entry.title,
      entry.author,
      entry.duration,
      entry.url,
      entry.thumbnail,
      entry.source,
      entry.playedBy,
      entry.playDuration,
      entry.skipped,
    ]
  )
}

export async function upsertMusicSessionSnapshot(entry: {
  guildId: string
  sessionSnapshotId: string
  currentTrack: SnapshotTrack | null
  upcomingTracks: SnapshotTrack[]
  voiceChannelId: string | null
}): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO music_session_snapshots
      (id, "guildId", "sessionSnapshotId", "savedAt", "currentTrack", "upcomingTracks", "voiceChannelId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now(), $4, $5, $6, now(), now())
     ON CONFLICT ("guildId") DO UPDATE SET
      "sessionSnapshotId" = EXCLUDED."sessionSnapshotId",
      "savedAt" = now(),
      "currentTrack" = EXCLUDED."currentTrack",
      "upcomingTracks" = EXCLUDED."upcomingTracks",
      "voiceChannelId" = EXCLUDED."voiceChannelId",
      "updatedAt" = now()`,
    [
      randomUUID(),
      entry.guildId,
      entry.sessionSnapshotId,
      JSON.stringify(entry.currentTrack),
      JSON.stringify(entry.upcomingTracks),
      entry.voiceChannelId,
    ]
  )
}

export async function insertNamedQueue(entry: {
  guildId: string
  name: string
  savedBy: string
  voiceChannelId: string | null
  currentTrack: SnapshotTrack | null
  upcomingTracks: SnapshotTrack[]
}): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO named_queues
      (id, "guildId", name, "savedBy", "savedAt", "trackCount", "voiceChannelId", "currentTrack", "upcomingTracks", "createdAt")
     VALUES ($1, $2, $3, $4, now(), $5, $6, $7, $8, now())
     ON CONFLICT ("guildId", name) DO UPDATE SET
      "savedBy" = EXCLUDED."savedBy",
      "savedAt" = now(),
      "trackCount" = EXCLUDED."trackCount",
      "voiceChannelId" = EXCLUDED."voiceChannelId",
      "currentTrack" = EXCLUDED."currentTrack",
      "upcomingTracks" = EXCLUDED."upcomingTracks"`,
    [
      randomUUID(),
      entry.guildId,
      entry.name,
      entry.savedBy,
      entry.upcomingTracks.length + (entry.currentTrack ? 1 : 0),
      entry.voiceChannelId,
      JSON.stringify(entry.currentTrack),
      JSON.stringify(entry.upcomingTracks),
    ]
  )
}

async function upsertGuildCounter(
  guildId: string,
  column: 'autoplayCount' | 'repeatCount',
  delta: number
): Promise<void> {
  const db = getPool()
  if (!db) return
  await db.query(
    `INSERT INTO guild_counters (id, "guildId", "${column}", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT ("guildId") DO UPDATE SET
      "${column}" = guild_counters."${column}" + $3,
      "updatedAt" = now()`,
    [randomUUID(), guildId, delta]
  )
}

export function incrementAutoplayCounter(guildId: string): Promise<void> {
  return upsertGuildCounter(guildId, 'autoplayCount', 1)
}

export function incrementRepeatCounter(guildId: string): Promise<void> {
  return upsertGuildCounter(guildId, 'repeatCount', 1)
}
