const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
]

// Relative "created X ago" readout for a project's createdAt (design D9,
// enrich-project-list) — no date library needed for something this small;
// Intl.RelativeTimeFormat already ships in every supported browser.
export function timeAgo(isoDate: string, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - new Date(isoDate).getTime()) / 1000)
  if (seconds < 60) return 'just now'

  for (const [unit, unitSeconds] of UNITS) {
    const value = Math.floor(seconds / unitSeconds)
    if (value >= 1) {
      return `${value} ${unit}${value === 1 ? '' : 's'} ago`
    }
  }
  return `${Math.floor(seconds / 60)} minutes ago`
}
