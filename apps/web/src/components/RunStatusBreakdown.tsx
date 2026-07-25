import type { components } from '@testpulse/shared/api'

type Status = components['schemas']['Status']

// Chart-specific status→color mapping (docs/design-system.md's "Chart
// colors" section) — distinct from StatusBadge.tsx's dot indicator, which
// is a separate, already-settled system on the semantic UI tokens. Every
// status gets its own resolved color from the existing --chart-1..5
// palette; retest (the 6th) gets a texture over an existing color rather
// than a new hue.
const STATUS_COLOR: Record<Status, string> = {
  pass: 'var(--chart-1)',
  skipped: 'var(--chart-2)',
  failed: 'var(--chart-3)',
  blocked: 'var(--chart-4)',
  pending: 'var(--chart-5)',
  retest: 'var(--chart-5)',
}
const RETEST_TEXTURE =
  'repeating-linear-gradient(135deg, transparent, transparent 3px, color-mix(in srgb, var(--background) 45%, transparent) 3px, color-mix(in srgb, var(--background) 45%, transparent) 6px)'

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pending',
  pass: 'Pass',
  failed: 'Failed',
  skipped: 'Skipped',
  blocked: 'Blocked',
  retest: 'Retest',
}

// Bad-outcome-first reading order: pass anchors the bar, then the two
// terminal problem states, then the softer in-between ones.
const STATUS_ORDER: Status[] = ['pass', 'failed', 'blocked', 'skipped', 'retest', 'pending']

export function RunStatusBreakdown({
  total,
  counts,
}: {
  total: number
  counts: Partial<Record<Status, number>>
}) {
  if (total === 0) {
    return (
      <div className="space-y-2">
        <span
          data-testid="run-status-breakdown-placeholder"
          aria-hidden="true"
          className="block h-2.5 w-full rounded-full border-[1.5px] border-dashed border-muted-foreground/30"
        />
        <p className="text-sm text-muted-foreground">No items yet — add cases to this run to see its status breakdown here.</p>
      </div>
    )
  }

  const passRate = Math.round(((counts.pass ?? 0) / total) * 100)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black tracking-tight">{passRate}%</span>
        <span className="text-xs text-muted-foreground">pass · {total} items</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-border">
        {STATUS_ORDER.filter((status) => (counts[status] ?? 0) > 0).map((status) => (
          <span
            key={status}
            data-testid={`run-status-segment-${status}`}
            title={`${STATUS_LABEL[status]} · ${counts[status]}`}
            className="h-full"
            style={{
              width: `${((counts[status] ?? 0) / total) * 100}%`,
              background: STATUS_COLOR[status],
              backgroundImage: status === 'retest' ? RETEST_TEXTURE : undefined,
            }}
          />
        ))}
      </div>
      <ul aria-label="Status breakdown" className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {STATUS_ORDER.map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-sm"
              style={{
                background: STATUS_COLOR[status],
                backgroundImage: status === 'retest' ? RETEST_TEXTURE : undefined,
              }}
            />
            <span>{STATUS_LABEL[status]}</span>
            <span>{counts[status] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
