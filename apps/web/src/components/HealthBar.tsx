// Pass-rate color bands, shared by every place a run's health is shown at
// a glance (project landing panels, project list). Bands mirror
// StatusBadge's pass/warn/fail semantics: teal = healthy, amber = watch,
// coral = attention needed.
export function healthColor(rate: number): string {
  if (rate >= 80) return 'bg-primary'
  if (rate >= 50) return 'bg-secondary'
  return 'bg-destructive'
}

// Same bands, resolved to a CSS custom property rather than a Tailwind class
// — for the summary strip's conic-gradient ring and the Recent runs panel's
// segmented pass/fail bar (enrich-project-landing-panels), both of which
// need a real color value in an inline style, not a class.
export function healthColorVar(rate: number): string {
  if (rate >= 80) return 'var(--primary)'
  if (rate >= 50) return 'var(--secondary)'
  return 'var(--destructive)'
}

// Word form of the same bands as healthColor (design D5) — the caller
// handles passRate === null ("No runs yet") since this only ever receives
// a real number. English-only for now (design D7, 2026-07-14) — the UI has
// no i18n/locale detection yet, so labels stay in one language until that
// lands rather than mixing languages within the same page.
export function healthLabel(rate: number): 'Healthy' | 'In progress' | 'At risk' {
  if (rate >= 80) return 'Healthy'
  if (rate >= 50) return 'In progress'
  return 'At risk'
}

export function HealthBar({ rate }: { rate: number }) {
  // A real 0% is the one value most worth noticing (everything failed) —
  // give it a visible sliver rather than a width:0 bar indistinguishable
  // from an empty track.
  const width = rate === 0 ? '8%' : `${rate}%`
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-1 w-9 overflow-hidden rounded-full bg-muted">
        <span data-fill className={`block h-full ${healthColor(rate)}`} style={{ width }} />
      </span>
      {rate}%
    </span>
  )
}

// Tint pair per band, matching the approved mockup's badge colors exactly
// (values pulled from its computed styles, then registered as CSS custom
// properties in index.css so both themes stay in one place).
const pillClasses: Record<'Healthy' | 'In progress' | 'At risk' | 'No runs yet', string> = {
  Healthy: 'bg-status-healthy-bg text-status-healthy-fg',
  'In progress': 'bg-status-progress-bg text-status-progress-fg',
  'At risk': 'bg-status-risk-bg text-status-risk-fg',
  'No runs yet': 'bg-status-neutral-bg text-status-neutral-fg',
}

// Status badge shown on its own row on a project card — word-only, no
// percentage (the number lives in the Favorites mini-card instead, per the
// approved mockup's split: full cards scan by word, favorite chips scan by
// number).
// dot is opt-in (default off) — ProjectsPage cards' own approved mockup is
// word-only with no dot; the project landing summary strip's mockup adds
// one (enrich-project-landing-panels). Same component, two call sites, each
// matching its own source of truth rather than forcing one look on both.
export function StatusPill({ rate, dot }: { rate: number | null; dot?: boolean }) {
  const label = rate === null ? 'No runs yet' : healthLabel(rate)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${pillClasses[label]}`}
    >
      {dot && <span data-dot className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {label}
    </span>
  )
}

function bandOf(rate: number | null): 'Healthy' | 'In progress' | 'At risk' | 'No runs yet' {
  return rate === null ? 'No runs yet' : healthLabel(rate)
}

// Solid-color dot for the compact list row — same bands as StatusPill, but
// a single color chip rather than a filled pill, since compact rows carry
// far less visual weight per item (design D10).
const dotClasses: Record<ReturnType<typeof bandOf>, string> = {
  Healthy: 'bg-primary',
  'In progress': 'bg-secondary',
  'At risk': 'bg-destructive',
  'No runs yet': 'bg-muted-foreground/40',
}
export function statusDotClass(rate: number | null): string {
  return dotClasses[bandOf(rate)]
}

// Left-edge accent bar on the expanded card — lets a status be scanned by
// color before reading the pill, a step further than the pill/bar alone
// (design D10).
const borderAccentClasses: Record<ReturnType<typeof bandOf>, string> = {
  Healthy: 'border-l-primary',
  'In progress': 'border-l-secondary',
  'At risk': 'border-l-destructive',
  'No runs yet': 'border-l-border',
}
export function statusBorderClass(rate: number | null): string {
  return borderAccentClasses[bandOf(rate)]
}

// Same tint tokens as StatusPill's foreground, usable directly on plain
// text (design D11) — for the compact chip's percentage readout, so it
// reads as colored-by-status rather than uniform gray.
const textClasses: Record<ReturnType<typeof bandOf>, string> = {
  Healthy: 'text-status-healthy-fg',
  'In progress': 'text-status-progress-fg',
  'At risk': 'text-status-risk-fg',
  'No runs yet': 'text-status-neutral-fg',
}
export function statusTextClass(rate: number | null): string {
  return textClasses[bandOf(rate)]
}

// Standalone progress bar (no label) for the project card — thicker than
// HealthBar's inline sliver since it carries the whole row on a card,
// rather than sitting beside a numeric readout.
export function ProgressBar({ rate }: { rate: number | null }) {
  if (rate === null) {
    return (
      <span
        data-track
        className="block h-2.5 w-full rounded-full border-[1.5px] border-dashed border-muted-foreground/30"
      />
    )
  }
  const width = rate === 0 ? '8%' : `${rate}%`
  return (
    <span data-track className="block h-[7px] w-full overflow-hidden rounded-full bg-border">
      <span data-fill className={`block h-full rounded-full ${healthColor(rate)}`} style={{ width }} />
    </span>
  )
}

// Donut ring for the project landing's summary strip (enrich-project-landing-panels)
// — a conic-gradient needs a real color value, not a Tailwind class, so it's
// the one health visualization that reaches for healthColorVar directly.
export function HealthRing({ rate }: { rate: number | null }) {
  const pct = rate ?? 0
  return (
    <span
      data-testid="health-ring"
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full"
      style={{
        background:
          rate === null
            ? 'var(--muted)'
            : `conic-gradient(${healthColorVar(rate)} ${pct}%, var(--muted) 0)`,
      }}
    >
      <span className="flex size-8.5 items-center justify-center rounded-full bg-card text-[11px] font-bold tabular-nums">
        {rate === null ? '—' : `${rate}%`}
      </span>
    </span>
  )
}
