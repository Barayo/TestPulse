import { useTranslation } from 'react-i18next'
import type { TFunction, ParseKeys } from 'i18next'
import type { components } from '@testpulse/shared/api'

type Status = components['schemas']['Status']

// Chart-specific status→color mapping (docs/design-system.md's "Chart
// colors" section) — distinct from StatusBadge.tsx's dot indicator, which
// is a separate, already-settled system on the semantic UI tokens. Every
// status gets its own resolved color from the existing --chart-1..5
// palette; retest (the 6th) gets a texture over an existing color rather
// than a new hue.
export const STATUS_COLOR: Record<Status, string> = {
  pass: 'var(--chart-1)',
  skipped: 'var(--chart-2)',
  failed: 'var(--chart-3)',
  blocked: 'var(--chart-4)',
  pending: 'var(--chart-5)',
  retest: 'var(--chart-5)',
}
export const RETEST_TEXTURE =
  'repeating-linear-gradient(135deg, transparent, transparent 3px, color-mix(in srgb, var(--background) 45%, transparent) 3px, color-mix(in srgb, var(--background) 45%, transparent) 6px)'

// Was a plain Record<Status, string> constant (STATUS_LABEL) before the
// i18n retrofit (add-ui-i18n) — every call site now already has a `t` in
// scope (all four consuming files are components/hook-bodies), so this
// became a small function taking `t` explicitly rather than a module-level
// constant, which can't call useTranslation() itself.
const STATUS_LABEL_KEYS: Record<Status, ParseKeys> = {
  pending: 'RunStatusBreakdown.statusPending',
  pass: 'RunStatusBreakdown.statusPass',
  failed: 'RunStatusBreakdown.statusFailed',
  skipped: 'RunStatusBreakdown.statusSkipped',
  blocked: 'RunStatusBreakdown.statusBlocked',
  retest: 'RunStatusBreakdown.statusRetest',
}

export function statusLabel(status: Status, t: TFunction): string {
  return t(STATUS_LABEL_KEYS[status])
}

// Bad-outcome-first reading order: pass anchors the bar, then the two
// terminal problem states, then the softer in-between ones.
export const STATUS_ORDER: Status[] = ['pass', 'failed', 'blocked', 'skipped', 'retest', 'pending']

export function RunStatusBreakdown({
  total,
  counts,
  emptyMessage,
}: {
  total: number
  counts: Partial<Record<Status, number>>
  emptyMessage?: string
}) {
  const { t } = useTranslation()
  const effectiveEmptyMessage = emptyMessage ?? t('RunStatusBreakdown.defaultEmptyMessage')
  if (total === 0) {
    return (
      <div className="space-y-2">
        <span
          data-testid="run-status-breakdown-placeholder"
          aria-hidden="true"
          className="block h-2.5 w-full rounded-full border-[1.5px] border-dashed border-muted-foreground/30"
        />
        <p className="text-sm text-muted-foreground">{effectiveEmptyMessage}</p>
      </div>
    )
  }

  const passRate = Math.round(((counts.pass ?? 0) / total) * 100)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black tracking-tight">{passRate}%</span>
        <span className="text-xs text-muted-foreground">{t('RunStatusBreakdown.passRateCaption', { count: total })}</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-border">
        {STATUS_ORDER.filter((status) => (counts[status] ?? 0) > 0).map((status) => (
          <span
            key={status}
            data-testid={`run-status-segment-${status}`}
            title={`${statusLabel(status, t)} · ${counts[status]}`}
            className="h-full"
            style={{
              width: `${((counts[status] ?? 0) / total) * 100}%`,
              background: STATUS_COLOR[status],
              backgroundImage: status === 'retest' ? RETEST_TEXTURE : undefined,
            }}
          />
        ))}
      </div>
      <ul aria-label={t('RunStatusBreakdown.statusBreakdownAriaLabel')} className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
            <span>{statusLabel(status, t)}</span>
            <span>{counts[status] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
