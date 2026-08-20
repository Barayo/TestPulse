// CaseDetailPage fetches the case's last N executions and passes them as
// `data`; when omitted, this renders the empty-state chrome only — the
// section never disappears when there's nothing to show.
// No section title here — the hosting CaseSidebarSection owns that, so this
// panel can be dropped into any titled section without a duplicate heading.
import type { components } from '@testpulse/shared/api'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, RETEST_TEXTURE } from './RunStatusBreakdown'

export type Verdict = components['schemas']['Status']

export type CaseResultsData = {
  successRate: number
  lastRunAt: string
  recent: { verdict: Verdict; date: string }[]
}

export function CaseResultsPanel({ data }: { data?: CaseResultsData }) {
  if (!data) {
    return (
      <div className="space-y-2">
        <div
          data-testid="case-results-placeholder-chart"
          aria-hidden="true"
          className="flex h-10 items-end gap-1"
        >
          {[40, 60, 30, 70, 50, 65, 45].map((height, i) => (
            <span key={i} className="w-2 flex-1 rounded-t bg-muted" style={{ height: `${height}%` }} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">No result history yet — record a run to see success rate here.</p>
      </div>
    )
  }

  // Verdict is a discrete status, not a magnitude — bars stay uniform
  // height so nothing implies a value difference between runs that isn't
  // there. Identity is never color-alone: every bar has an accessible name
  // (aria-label) plus a hover/focus tooltip, and a legend with counts backs
  // it up regardless of hover.
  const presentVerdicts = STATUS_ORDER.filter((v) => data.recent.some((r) => r.verdict === v))
  const counts: Partial<Record<Verdict, number>> = {}
  for (const r of data.recent) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black tracking-tight">{data.successRate}%</span>
        <span className="text-xs text-muted-foreground">success · last {data.recent.length} runs</span>
      </div>
      <div className="flex h-9 items-stretch gap-[3px]">
        {data.recent.map((r, i) => (
          <button
            key={i}
            type="button"
            data-testid="case-result-bar"
            aria-label={`${STATUS_LABEL[r.verdict]} · ${r.date}`}
            className="group relative flex-1 rounded-t-[5px] rounded-b-sm outline-none transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:brightness-110 focus-visible:-translate-y-0.5 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:brightness-110"
            style={{
              background: STATUS_COLOR[r.verdict],
              backgroundImage: r.verdict === 'retest' ? RETEST_TEXTURE : undefined,
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-tight text-popover-foreground opacity-0 shadow-lg transition-[opacity,transform] duration-100 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
            >
              <span className="font-semibold">{STATUS_LABEL[r.verdict]}</span>
              <br />
              {r.date}
            </span>
          </button>
        ))}
      </div>
      <ul aria-label="Status breakdown" className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {presentVerdicts.map((v) => (
          <li key={v} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-sm"
              style={{ background: STATUS_COLOR[v], backgroundImage: v === 'retest' ? RETEST_TEXTURE : undefined }}
            />
            <span>{STATUS_LABEL[v]}</span>
            <span className="font-medium text-foreground">{counts[v]}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Last run {data.lastRunAt}</p>
    </div>
  )
}
