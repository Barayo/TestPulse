import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { STATUS_COLOR, STATUS_ORDER, RETEST_TEXTURE, statusLabel } from './RunStatusBreakdown'
import type { components } from '@testpulse/shared/api'

type Status = components['schemas']['Status']

// A suite's run history as one 100%-stacked bar per run, replacing the old
// single pass-rate line (add-suite-run-breakdown-trend, GH #137) — reuses
// RunStatusBreakdown's exact color/texture/order tokens rather than
// inventing new ones, and ports SuitePassRateTrend's margin/axis/tooltip-
// clamping/endpoint conventions so both charts feel like the same family.
export type RunBreakdownPoint = {
  runKey: string
  runName: string
  createdAt: string
  total: number
  counts: Partial<Record<Status, number>>
  // Only the trailing point from includeOpen=true is ever true — a
  // suite's current in-progress run, rendered distinctly since its counts
  // are still mid-flight, not a settled outcome (design.md D3).
  isOpen?: boolean
}

const ENDPOINT_RING = '0 0 0 2px var(--card), 0 0 0 4px color-mix(in srgb, var(--primary) 35%, transparent)'
const OPEN_OPACITY = 0.55

function xPercent(index: number, count: number): number {
  if (count === 1) return 50
  return (index / (count - 1)) * 100
}

// Clamps a tooltip's horizontal anchor so it stays on-screen near either
// edge of the chart (ported from SuitePassRateTrend).
function tooltipTransformX(xPercentValue: number): string {
  if (xPercentValue <= 15) return 'translateX(0)'
  if (xPercentValue >= 85) return 'translateX(-100%)'
  return 'translateX(-50%)'
}

function formatAxisDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function passRateOf(p: RunBreakdownPoint): number {
  if (p.total === 0) return 0
  return Math.round(((p.counts.pass ?? 0) / p.total) * 100)
}

// Extends the existing detail-string template
// ("{name} · {date} · {rate}% ({pass}/{total} pass)") with every non-zero
// non-pass status, plus an explicit in-progress marker for an open run —
// this is the chart's only accessible description of its full breakdown,
// not color alone.
function detailOf(p: RunBreakdownPoint, t: TFunction): string {
  const rate = passRateOf(p)
  const base = t('SuiteRunBreakdownTrend.barDetailBase', {
    name: p.runName,
    date: formatAxisDate(p.createdAt),
    rate,
    pass: p.counts.pass ?? 0,
    total: p.total,
  })
  const extras = STATUS_ORDER.filter((s) => s !== 'pass' && (p.counts[s] ?? 0) > 0).map((s) => `${p.counts[s]} ${statusLabel(s, t).toLowerCase()}`)
  let detail = extras.length > 0 ? `${base} — ${extras.join(', ')}` : base
  if (p.isOpen) detail += t('SuiteRunBreakdownTrend.stillOpenSuffix')
  return detail
}

export function SuiteRunBreakdownTrend({
  points,
  emptyMessage,
}: {
  points: RunBreakdownPoint[]
  emptyMessage: string
}) {
  const { t } = useTranslation()
  const [activeKey, setActiveKey] = useState<string | null>(null)

  if (points.length === 0) {
    return (
      <div className="space-y-2">
        <span
          data-testid="suite-breakdown-placeholder"
          aria-hidden="true"
          className="block h-2.5 w-full rounded-full border-[1.5px] border-dashed border-muted-foreground/30"
        />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  const activeIndex = points.findIndex((p) => p.runKey === activeKey)
  const activePoint = activeIndex >= 0 ? points[activeIndex] : undefined

  return (
    <div className="space-y-2">
      {/* Same margin structure as SuitePassRateTrend (design.md D2 in
          add-suite-pass-rate-trend): fixed-pixel headroom for the tooltip,
          x-axis date range, and y-axis labels around a nested plot area.
          Taller than the line chart (h-32 vs h-24) — a thin 2-3% sliver
          needs more raw pixel height to render as a visible stack segment. */}
      <div className="relative h-32 w-full">
        <span data-testid="suite-breakdown-axis-y-100" aria-hidden="true" className="absolute left-0 text-[10px] text-muted-foreground" style={{ top: 24, transform: 'translateY(-50%)' }}>
          100%
        </span>
        <span data-testid="suite-breakdown-axis-y-50" aria-hidden="true" className="absolute left-0 text-[10px] text-muted-foreground" style={{ top: '50%', transform: 'translateY(-50%)' }}>
          50%
        </span>
        <span data-testid="suite-breakdown-axis-y-0" aria-hidden="true" className="absolute left-0 text-[10px] text-muted-foreground" style={{ bottom: 20, transform: 'translateY(50%)' }}>
          0%
        </span>
        {points.length > 1 && (
          <>
            <span data-testid="suite-breakdown-axis-x-start" aria-hidden="true" className="absolute text-[10px] text-muted-foreground" style={{ left: 28, bottom: 0 }}>
              {formatAxisDate(points[0].createdAt)}
            </span>
            <span data-testid="suite-breakdown-axis-x-end" aria-hidden="true" className="absolute right-0 text-[10px] text-muted-foreground" style={{ bottom: 0 }}>
              {formatAxisDate(points[points.length - 1].createdAt)}
            </span>
          </>
        )}
        <div className="absolute" style={{ top: 24, right: 0, bottom: 20, left: 28 }}>
          <div className="absolute inset-x-0" style={{ top: 0, height: 1, background: 'var(--border)' }} aria-hidden="true" />
          <div className="absolute inset-x-0" style={{ top: '50%', height: 1, background: 'var(--border)' }} aria-hidden="true" />
          <div className="absolute inset-0 flex items-end gap-1.5">
            {points.map((p, i) => {
              const isEndpoint = i === points.length - 1
              const rate = passRateOf(p)
              return (
                <div key={p.runKey} className="relative flex h-full min-w-[18px] max-w-14 flex-1 items-end">
                  <button
                    type="button"
                    data-testid={`suite-breakdown-bar-${p.runKey}`}
                    data-endpoint={isEndpoint ? 'true' : undefined}
                    data-open={p.isOpen ? 'true' : undefined}
                    aria-label={detailOf(p, t)}
                    onMouseEnter={() => setActiveKey(p.runKey)}
                    onMouseLeave={() => setActiveKey((k) => (k === p.runKey ? null : k))}
                    onFocus={() => setActiveKey(p.runKey)}
                    onBlur={() => setActiveKey((k) => (k === p.runKey ? null : k))}
                    className="flex h-full w-full flex-col-reverse overflow-hidden rounded-t-sm rounded-b-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    style={{
                      opacity: p.isOpen ? OPEN_OPACITY : 1,
                      boxShadow: isEndpoint ? ENDPOINT_RING : undefined,
                    }}
                  >
                    {STATUS_ORDER.filter((status) => (p.counts[status] ?? 0) > 0).map((status) => (
                      <span
                        key={status}
                        data-testid={`suite-breakdown-segment-${p.runKey}-${status}`}
                        className="w-full shrink-0"
                        style={{
                          height: `${((p.counts[status] ?? 0) / p.total) * 100}%`,
                          background: STATUS_COLOR[status],
                          backgroundImage: status === 'retest' ? RETEST_TEXTURE : undefined,
                        }}
                      />
                    ))}
                  </button>
                  {isEndpoint && (
                    <span
                      data-testid="suite-breakdown-endpoint-label"
                      aria-hidden="true"
                      className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xs font-semibold tabular-nums whitespace-nowrap"
                    >
                      {rate}%
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {activePoint && (
            <div
              role="tooltip"
              data-testid="suite-breakdown-tooltip"
              className="pointer-events-none absolute z-10 rounded-md border bg-card px-2 py-1.5 text-xs whitespace-nowrap shadow-lg"
              style={{
                left: `${xPercent(activeIndex, points.length)}%`,
                bottom: '100%',
                marginBottom: 8,
                transform: tooltipTransformX(xPercent(activeIndex, points.length)),
              }}
            >
              <div className="mb-1 font-semibold">
                {activePoint.runName} · {formatAxisDate(activePoint.createdAt)}
              </div>
              {STATUS_ORDER.filter((status) => (activePoint.counts[status] ?? 0) > 0).map((status) => (
                <div key={status} className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-sm"
                    style={{ background: STATUS_COLOR[status], backgroundImage: status === 'retest' ? RETEST_TEXTURE : undefined }}
                  />
                  <span>
                    {statusLabel(status, t)}: <span className="font-medium text-card-foreground">{activePoint.counts[status]}</span> (
                    {Math.round(((activePoint.counts[status] ?? 0) / activePoint.total) * 100)}%)
                  </span>
                </div>
              ))}
              {activePoint.isOpen && <div className="mt-1 border-t pt-1 text-muted-foreground">{t('SuiteRunBreakdownTrend.stillOpenTooltip')}</div>}
            </div>
          )}
        </div>
      </div>
      <ul aria-label={t('SuiteRunBreakdownTrend.statusBreakdownAriaLabel')} className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {STATUS_ORDER.map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-sm"
              style={{ background: STATUS_COLOR[status], backgroundImage: status === 'retest' ? RETEST_TEXTURE : undefined }}
            />
            <span>{statusLabel(status, t)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
