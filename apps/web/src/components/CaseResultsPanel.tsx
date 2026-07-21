// add-case-result-history (a follow-up change) owns fetching real result
// history; this component owns rendering it once fetched. Until then,
// CaseDetailPage passes no `data` and this renders the empty-state chrome
// only — the section never disappears when there's nothing to show.
// No section title here — the hosting CaseSidebarSection owns that, so this
// panel can be dropped into any titled section without a duplicate heading.

export type Verdict = 'pass' | 'failed' | 'skipped'

export type CaseResultsData = {
  successRate: number
  lastRunAt: string
  recent: { verdict: Verdict; date: string }[]
}

// Reuses the app's existing status semantics (--chart-1/2/3, the same
// colors StatusBadge/StatusPill already use) — no new hues invented.
const VERDICT_COLOR: Record<Verdict, string> = {
  pass: 'var(--chart-1)',
  skipped: 'var(--chart-2)',
  failed: 'var(--chart-3)',
}
const VERDICT_LABEL: Record<Verdict, string> = { pass: 'Pass', skipped: 'Skipped', failed: 'Fail' }

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
  // there. Identity is never color-alone: every bar has a text tooltip,
  // and a legend + plain-text breakdown back it up regardless of hover.
  const presentVerdicts = Array.from(new Set(data.recent.map((r) => r.verdict)))

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black tracking-tight">{data.successRate}%</span>
        <span className="text-xs text-muted-foreground">success · last {data.recent.length} runs</span>
      </div>
      <div className="flex h-8 items-end gap-1">
        {data.recent.map((r, i) => (
          <span
            key={i}
            data-testid="case-result-bar"
            title={`${VERDICT_LABEL[r.verdict]} · ${r.date}`}
            className="h-full flex-1 rounded-t"
            style={{ background: VERDICT_COLOR[r.verdict] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {presentVerdicts.map((v) => (
          <span key={v} className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: VERDICT_COLOR[v] }} aria-hidden="true" />
            {VERDICT_LABEL[v]}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Last run {data.lastRunAt}</p>
    </div>
  )
}
