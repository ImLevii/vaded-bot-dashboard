export function formatDuration(duration: number | undefined, live = false): string {
  if (live || duration === Infinity || (duration !== undefined && duration > 3600000000))
    return 'Live'
  if (!Number.isFinite(duration) || !duration || duration < 0) return '00:00'
  const total = Math.floor(duration / 1000)
  const seconds = String(total % 60).padStart(2, '0')
  const minutes = String(Math.floor(total / 60) % 60).padStart(2, '0')
  const hours = Math.floor(total / 3600)
  return hours ? `${String(hours).padStart(2, '0')}:${minutes}:${seconds}` : `${minutes}:${seconds}`
}
