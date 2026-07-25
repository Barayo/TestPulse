import type { components } from '@testpulse/shared/api'

type SuiteTrendPoint = components['schemas']['SuiteTrendPoint']

// A single series (pass rate over a suite's own closed runs) needs no legend
// box — the headline number and the "Pass rate" framing already name it
// (dataviz skill: "a single series needs no legend"). Uses the same --primary
// "pass" semantic every other pass-rate treatment in the app uses, rather
// than a new hue.
const CHART_HEIGHT = 40
const CHART_WIDTH = 100 // viewBox units; scales via width:100% in CSS

function passRate(point: SuiteTrendPoint): number {
  return point.total === 0 ? 0 : Math.round(((point.counts.pass ?? 0) / point.total) * 100)
}

// Inverted (0% at the bottom, 100% at the top) — SVG y grows downward.
function yFor(rate: number): number {
  return CHART_HEIGHT - (rate / 100) * CHART_HEIGHT
}

function xFor(index: number, count: number): number {
  if (count === 1) return CHART_WIDTH / 2
  return (index / (count - 1)) * CHART_WIDTH
}

export function SuitePassRateTrend({ points }: { points: SuiteTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="space-y-2">
        <span
          data-testid="suite-trend-placeholder"
          aria-hidden="true"
          className="block h-2.5 w-full rounded-full border-[1.5px] border-dashed border-muted-foreground/30"
        />
        <p className="text-sm text-muted-foreground">
          No closed runs yet — close a run created from this suite to see its trend here.
        </p>
      </div>
    )
  }

  const latest = points[points.length - 1]
  const latestRate = passRate(latest)
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i, points.length)} ${yFor(passRate(p))}`)
    .join(' ')

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black tracking-tight">{latestRate}%</span>
        <span className="text-xs text-muted-foreground">pass · {points.length} runs</span>
      </div>
      <svg
        role="img"
        aria-label={`Pass rate trend across ${points.length} closed runs, latest ${latestRate}%`}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-10 w-full"
      >
        <path
          data-testid="suite-trend-line"
          d={pathD}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => {
          const rate = passRate(p)
          const date = new Date(p.createdAt).toLocaleDateString()
          return (
            <circle
              key={p.runKey}
              data-testid={`suite-trend-point-${p.runKey}`}
              cx={xFor(i, points.length)}
              cy={yFor(rate)}
              r={2.5}
              fill="var(--primary)"
            >
              <title>
                {p.runName} · {date} · {rate}% ({p.counts.pass ?? 0}/{p.total} pass)
              </title>
            </circle>
          )
        })}
      </svg>
    </div>
  )
}
