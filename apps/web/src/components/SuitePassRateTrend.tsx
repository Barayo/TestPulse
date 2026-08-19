import { useState } from 'react'

// A single series (pass rate over a suite's runs) needs no legend box — the
// "pass" framing already names it (dataviz skill: "a single series needs no
// legend"). Uses the same --primary "pass" semantic every other pass-rate
// treatment in the app uses, rather than a new hue.
//
// Point markers are an absolutely-positioned HTML overlay, not SVG <circle>
// elements (rework-suite-run-flow design.md D7) — the chart's viewBox is
// stretched non-uniformly by preserveAspectRatio="none" to fill a wide,
// short card, which is correct for the line itself but squashes a circle's
// *fill geometry* into an ellipse (vector-effect="non-scaling-stroke" only
// protects stroke width, not fill shape, so it can't fix this). Markers
// living in real CSS pixels outside that transform can't be distorted by it.
//
// No headline number here anymore (design.md D11) — a single most-recent-
// closed-run rate, blown up to hero-number size, read as an aggregate of
// every point on this chart even though it wasn't one (a real user
// confusion, not a copy problem — the same `"{n}% pass · {n} runs"` template
// is this app's existing shorthand for genuine aggregates elsewhere,
// RunStatusBreakdown/CaseResultsPanel). That fact now lives as a plain
// property row in SuiteDetailPage.tsx, above this chart, computed once
// rather than per view. In its place, each point is a real interactive
// button revealing its own detail on hover/focus (replacing an inert native
// `title`), and only the endpoint — the one point already visually
// emphasized — carries an always-visible percentage label, so the chart
// states its own values without needing a misleading summary above it.
export type TrendPoint = {
  runKey: string
  runName: string
  createdAt: string
  rate: number
  isOpen: boolean
  detail: string
}

const POINT_SIZE = 7
const ENDPOINT_SIZE = 12

function xPercent(index: number, count: number): number {
  if (count === 1) return 50
  return (index / (count - 1)) * 100
}

function yPercent(rate: number): number {
  return 100 - rate
}

// Clamps a tooltip's horizontal anchor so it stays on-screen near either
// edge of the chart, instead of always centering on the point (which runs
// a wide tooltip off the left/right edge for the first/last point).
function tooltipTransformX(xPercentValue: number): string {
  if (xPercentValue <= 15) return 'translateY(-100%)'
  if (xPercentValue >= 85) return 'translate(-100%, -100%)'
  return 'translate(-50%, -100%)'
}

function formatAxisDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

export function SuitePassRateTrend({
  points,
  emptyMessage,
}: {
  points: TrendPoint[]
  emptyMessage: string
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null)

  if (points.length === 0) {
    return (
      <div className="space-y-2">
        <span
          data-testid="suite-trend-placeholder"
          aria-hidden="true"
          className="block h-2.5 w-full rounded-full border-[1.5px] border-dashed border-muted-foreground/30"
        />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  const latest = points[points.length - 1]
  const coords = points.map((p, i) => ({ x: xPercent(i, points.length), y: yPercent(p.rate) }))
  const linePathAll = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const areaPath = `${linePathAll} L 100 100 L 0 100 Z`

  const lastIsOpen = latest.isOpen && points.length > 1
  const solidPath = lastIsOpen
    ? coords.slice(0, -1).map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
    : linePathAll
  const dashPath = lastIsOpen
    ? `M ${coords[coords.length - 2].x} ${coords[coords.length - 2].y} L ${coords[coords.length - 1].x} ${coords[coords.length - 1].y}`
    : null

  const activeIndex = points.findIndex((p) => p.runKey === activeKey)
  const activePoint = activeIndex >= 0 ? points[activeIndex] : undefined

  return (
    <div className="space-y-2">
      {/* Outer box reserves fixed-pixel margins around a nested "plot area"
          (design.md D12): top for tooltip headroom, bottom for the x-axis
          date range, left for y-axis percentage labels. Absolutely
          positioned children measure against their own containing block's
          padding box, not a parent's CSS padding — so those margins have to
          be carved out structurally (a narrower inner positioned div), not
          via padding on this outer element, or the axis labels and the
          plot's own 0-100% coordinate space would overlap instead of sit
          beside each other. */}
      <div className="relative h-24 w-full">
        <span data-testid="suite-trend-axis-y-100" aria-hidden="true" className="absolute left-0 text-[10px] text-muted-foreground" style={{ top: 24, transform: 'translateY(-50%)' }}>
          100%
        </span>
        <span data-testid="suite-trend-axis-y-50" aria-hidden="true" className="absolute left-0 text-[10px] text-muted-foreground" style={{ top: 50, transform: 'translateY(-50%)' }}>
          50%
        </span>
        <span data-testid="suite-trend-axis-y-0" aria-hidden="true" className="absolute left-0 text-[10px] text-muted-foreground" style={{ bottom: 20, transform: 'translateY(50%)' }}>
          0%
        </span>
        {/* X-axis: the oldest/newest run's own date only — not one label per
            point. Points are laid out evenly by index, not by real elapsed
            calendar time, so a date under every point would visually assert
            even time-spacing that isn't real; a range instead gives honest
            orientation ("this spans about a month") without claiming
            per-point precision the current spacing can't back up. Exact
            per-point dates stay one hover/focus away via the tooltip. */}
        {points.length > 1 && (
          <>
            <span data-testid="suite-trend-axis-x-start" aria-hidden="true" className="absolute text-[10px] text-muted-foreground" style={{ left: 28, bottom: 0 }}>
              {formatAxisDate(points[0].createdAt)}
            </span>
            <span data-testid="suite-trend-axis-x-end" aria-hidden="true" className="absolute right-0 text-[10px] text-muted-foreground" style={{ bottom: 0 }}>
              {formatAxisDate(points[points.length - 1].createdAt)}
            </span>
          </>
        )}
        {/* The plot area itself: its own containing block for every
            percentage-based child below (points, tooltip, endpoint label,
            grid/line SVG), inset from the outer box by the margins above. */}
        <div className="absolute" style={{ top: 24, right: 0, bottom: 20, left: 28 }}>
        <svg
          role="img"
          aria-label={`Pass rate trend across ${points.length} runs`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <linearGradient id="suite-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <line x1={0} y1={0} x2={100} y2={0} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={50} x2={100} y2={50} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={areaPath} fill="url(#suite-trend-fill)" stroke="none" />
          <path
            data-testid="suite-trend-line"
            d={solidPath}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {dashPath && (
            <path
              data-testid="suite-trend-dash-segment"
              d={dashPath}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {points.map((p, i) => {
          const isEndpoint = i === points.length - 1
          const size = isEndpoint ? ENDPOINT_SIZE : POINT_SIZE
          return (
            <button
              key={p.runKey}
              type="button"
              data-testid={`suite-trend-point-${p.runKey}`}
              data-open={p.isOpen ? 'true' : undefined}
              aria-label={p.detail}
              onMouseEnter={() => setActiveKey(p.runKey)}
              onMouseLeave={() => setActiveKey((k) => (k === p.runKey ? null : k))}
              onFocus={() => setActiveKey(p.runKey)}
              onBlur={() => setActiveKey((k) => (k === p.runKey ? null : k))}
              className="absolute rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{
                left: `${coords[i].x}%`,
                top: `${coords[i].y}%`,
                width: size,
                height: size,
                transform: 'translate(-50%, -50%)',
                background: p.isOpen ? 'var(--card)' : 'var(--primary)',
                border: p.isOpen ? '2px dashed var(--primary)' : 'none',
                boxShadow:
                  isEndpoint && !p.isOpen
                    ? '0 0 0 2px var(--card), 0 0 0 6px color-mix(in srgb, var(--primary) 25%, transparent)'
                    : '0 0 0 2px var(--card)',
              }}
            />
          )
        })}
        {/* The one point already visually emphasized (D7) is the one point
            worth reading without interacting (design.md D11) — every other
            point stays reveal-on-hover/focus only, so this never becomes
            "a number on every point." */}
        <span
          data-testid="suite-trend-endpoint-label"
          aria-hidden="true"
          className="absolute text-xs font-semibold tabular-nums"
          style={{
            left: `${coords[coords.length - 1].x}%`,
            top: `${coords[coords.length - 1].y}%`,
            marginTop: -ENDPOINT_SIZE / 2 - 4,
            transform: tooltipTransformX(coords[coords.length - 1].x),
          }}
        >
          {latest.rate}%
        </span>
        {activePoint && (
          <div
            role="tooltip"
            data-testid="suite-trend-tooltip"
            className="pointer-events-none absolute z-10 rounded-md border bg-card px-2 py-1 text-xs whitespace-nowrap shadow-lg"
            style={{
              left: `${coords[activeIndex].x}%`,
              top: `${coords[activeIndex].y}%`,
              marginTop: -12,
              // A tooltip long enough to matter (a run name plus date plus
              // fraction) overflows the viewport when centered on a point
              // near either edge of the chart — clamp its horizontal anchor
              // instead of always centering (found live: the leftmost
              // point's tooltip ran off-screen, its run name unreadable).
              transform: tooltipTransformX(coords[activeIndex].x),
            }}
          >
            {activePoint.detail}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
