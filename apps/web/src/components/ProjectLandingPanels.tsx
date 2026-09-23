import { useState } from 'react'
import { FolderIcon, LayersIcon, CirclePlayIcon, ChevronRightIcon, BarChartIcon, PackageIcon } from 'lucide-react'
import type { LandingFolder, LandingSuite, LandingRun } from '@/lib/useProjectLanding'
import { HealthBar, StatusPill, healthColorVar, statusBorderClass } from '@/components/HealthBar'
import { ReleaseStatusBadge } from '@/components/ReleaseStatusBadge'
import { STATUS_COLOR, STATUS_ORDER } from '@/components/RunStatusBreakdown'
import { timeAgo } from '@/lib/timeAgo'
import type { components } from '@testpulse/shared/api'

type Status = components['schemas']['Status']
type ReleaseStatus = components['schemas']['ReleaseStatus']
type FlakyCase = components['schemas']['FlakyCase']

const FLAKY_ROWS_SHOWN = 3

export function PanelShell({
  icon,
  title,
  seeAllLabel,
  seeAllAriaLabel,
  onSeeAll,
  isEmpty,
  emptyLabel,
  children,
  featured,
}: {
  icon: React.ReactNode
  title: string
  seeAllLabel: string
  seeAllAriaLabel: string
  onSeeAll: () => void
  isEmpty: boolean
  emptyLabel: string
  children: React.ReactNode
  featured?: boolean
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border bg-card ${
        featured ? 'border-primary/35 shadow-sm' : 'border-border'
      }`}
    >
      {featured && <div className="h-[3px] bg-primary" aria-hidden="true" />}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="text-primary">{icon}</span>
          {title}
        </span>
        <button
          type="button"
          aria-label={seeAllAriaLabel}
          onClick={onSeeAll}
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          {seeAllLabel}
        </button>
      </div>
      {isEmpty ? (
        <p className="p-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col">{children}</ul>
      )}
    </div>
  )
}

function FolderRow({
  folder,
  maxCaseCount,
  onSelectFolder,
}: {
  folder: LandingFolder
  maxCaseCount: number
  onSelectFolder: (folderId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = folder.subsectionCount > 0
  const isEmptySection = folder.caseCount === 0
  const pct = maxCaseCount > 0 ? Math.round((folder.caseCount / maxCaseCount) * 100) : 0

  function activate() {
    if (hasChildren) setExpanded((v) => !v)
    else onSelectFolder(folder.id)
  }

  return (
    <li className="border-b border-border last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={hasChildren ? expanded : undefined}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-accent"
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            activate()
          }
        }}
      >
        {hasChildren && (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          >
            <ChevronRightIcon
              className={`size-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>
        )}
        <FolderIcon
          className={`size-4 shrink-0 ${isEmptySection ? 'text-muted-foreground/40' : 'text-primary'}`}
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`truncate ${isEmptySection ? 'font-normal text-muted-foreground italic' : 'font-medium'}`}>
            {folder.name}
          </span>
          {hasChildren && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {folder.subsectionCount} subsection{folder.subsectionCount === 1 ? '' : 's'}
            </span>
          )}
        </span>
        {isEmptySection ? (
          <span className="shrink-0 text-xs text-muted-foreground italic">No cases yet</span>
        ) : (
          <span className="flex shrink-0 items-center gap-2">
            <span className="h-1 w-11 overflow-hidden rounded-full bg-muted">
              <span data-fill className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {folder.caseCount} case{folder.caseCount === 1 ? '' : 's'}
            </span>
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <ul>
          {folder.children.map((child) => {
            const childPct = maxCaseCount > 0 ? Math.round((child.caseCount / maxCaseCount) * 100) : 0
            return (
              <li key={child.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 bg-background py-2 pr-4 pl-10 text-left text-sm hover:bg-accent"
                  onClick={() => onSelectFolder(child.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{child.name}</span>
                  <span className="h-1 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${childPct}%` }} />
                  </span>
                  <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {child.caseCount} case{child.caseCount === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

export function FoldersPanel({
  folders,
  totalCount,
  truncated,
  onSeeAll,
  onSelectFolder,
}: {
  folders: LandingFolder[]
  totalCount: number
  // fetchAllPages caps its drain (add-cursor-pagination task 12.1d) —
  // above the cap, `totalCount` undercounts. `truncated` tells the panel
  // to show it as a floor ("500+") instead of silently claiming an exact,
  // wrong total.
  truncated?: boolean
  onSeeAll: () => void
  onSelectFolder: (folderId: string) => void
}) {
  const maxCaseCount = Math.max(1, ...folders.map((f) => f.caseCount))
  return (
    <PanelShell
      icon={<FolderIcon className="size-4" aria-hidden="true" />}
      title="Library"
      seeAllLabel={totalCount > 0 ? `see all ${totalCount}${truncated ? '+' : ''} ›` : 'go to Library ›'}
      seeAllAriaLabel="Go to Library"
      onSeeAll={onSeeAll}
      isEmpty={folders.length === 0}
      emptyLabel="No sections yet · create the first one to organize your test cases."
    >
      {folders.map((f) => (
        <FolderRow key={f.id} folder={f} maxCaseCount={maxCaseCount} onSelectFolder={onSelectFolder} />
      ))}
    </PanelShell>
  )
}

export function SuitesPanel({
  suites,
  totalCount,
  truncated,
  onSeeAll,
  onSelectSuite,
}: {
  suites: LandingSuite[]
  totalCount: number
  truncated?: boolean
  onSeeAll: () => void
  onSelectSuite: (suiteId: string) => void
}) {
  return (
    <PanelShell
      icon={<LayersIcon className="size-4" aria-hidden="true" />}
      title="Suites"
      seeAllLabel={totalCount > 0 ? `see all ${totalCount}${truncated ? '+' : ''} ›` : 'go to Suites ›'}
      seeAllAriaLabel="Go to Suites"
      onSeeAll={onSeeAll}
      isEmpty={suites.length === 0}
      emptyLabel="No suites yet · create the first one to group test cases."
    >
      {suites.map((s) => (
        <li key={s.id} className="border-b border-border px-4 py-2.5 text-sm last:border-b-0">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left hover:text-foreground"
            onClick={() => onSelectSuite(s.id)}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{s.name}</span>
              <span className="text-xs text-muted-foreground">
                {s.caseCount} case{s.caseCount === 1 ? '' : 's'}
              </span>
            </span>
            {s.passRate === null ? (
              <span className="shrink-0 text-xs text-muted-foreground italic">Never run</span>
            ) : (
              <span className="shrink-0">
                <HealthBar rate={s.passRate} />
              </span>
            )}
          </button>
        </li>
      ))}
    </PanelShell>
  )
}

export function RunsPanel({
  runs,
  totalCount,
  onSeeAll,
  onSelectRun,
}: {
  runs: LandingRun[]
  totalCount: number
  onSeeAll: () => void
  onSelectRun: (runId: string) => void
}) {
  return (
    <PanelShell
      icon={<CirclePlayIcon className="size-4" aria-hidden="true" />}
      title="Recent runs"
      seeAllLabel={totalCount > 0 ? 'see all ›' : 'go to Runs ›'}
      seeAllAriaLabel="Go to Runs"
      onSeeAll={onSeeAll}
      isEmpty={runs.length === 0}
      emptyLabel="No runs yet."
      featured
    >
      {runs.map((r) => (
        <li
          key={r.id}
          className={`border-b border-l-2 border-border last:border-b-0 ${statusBorderClass(r.passRate)}`}
        >
          <button
            type="button"
            className="flex w-full flex-col gap-1.5 px-4 py-2.5 text-left hover:bg-accent"
            onClick={() => onSelectRun(r.id)}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-bold">{r.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
            </span>
            {r.passRate === null ? (
              <span className="text-xs text-muted-foreground">not run yet</span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="flex h-1.5 w-17 shrink-0 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full"
                    style={{ width: `${r.passRate === 0 ? 8 : r.passRate}%`, background: healthColorVar(r.passRate) }}
                  />
                  <span className="block h-full bg-destructive opacity-55" style={{ width: `${100 - r.passRate}%` }} />
                </span>
                <span className="text-xs font-bold tabular-nums">{r.passRate}%</span>
                <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {r.passCount}/{r.total} passed
                </span>
              </span>
            )}
          </button>
        </li>
      ))}
    </PanelShell>
  )
}

// A landing-page row for a project's Releases (introduce-release-test-plan)
// — reuses PanelShell exactly, but unlike Folders/Suites/Runs (always
// rendered, even empty) the caller never mounts this at all for a project
// with zero Releases: Release is opt-in at the data-model level, so
// "doesn't exist yet" and "exists but empty" are different states here,
// and only the first is truly invisible (design.md, Pepe mock screen 1).
export type LandingRelease = {
  key: string
  name: string
  status: ReleaseStatus
  passRate: number | null
  planCount: number
}

export function ReleasesPanel({
  releases,
  onSeeAll,
  onSelectRelease,
}: {
  releases: LandingRelease[]
  onSeeAll: () => void
  onSelectRelease: (releaseKey: string) => void
}) {
  return (
    <PanelShell
      icon={<PackageIcon className="size-4" aria-hidden="true" />}
      title="Releases"
      seeAllLabel="see all ›"
      seeAllAriaLabel="Go to Releases"
      onSeeAll={onSeeAll}
      isEmpty={false}
      emptyLabel=""
    >
      {releases.map((r) => (
        <li key={r.key} className="border-b border-border last:border-b-0">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-accent"
            onClick={() => onSelectRelease(r.key)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-bold">{r.name}</span>
              <ReleaseStatusBadge status={r.status} />
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs">
              <StatusPill rate={r.passRate} />
              <span className="text-muted-foreground">
                {r.planCount} plan{r.planCount === 1 ? '' : 's'}
              </span>
            </span>
          </button>
        </li>
      ))}
    </PanelShell>
  )
}

// A summary *across* the other three panels, not a fourth peer list — gets
// its own full-width row below them (ProjectPage.tsx) rather than squeezing
// into the shared grid, and reuses PanelShell's header chrome directly but
// not its isEmpty/children list body, which assumes <li> rows (add-project-
// reports-page design.md D7). The action link always reads "Open Reports",
// never "see all N ›" — that still holds for the status-breakdown half. The
// flaky-cases half is the one exception: it lists its top rows (already-
// fetched data, previously discarded down to a count) with its own
// "see more" affordance once there are more than it can show
// (dashboard-flaky-cases-list).
export function ReportsPanel({
  total,
  counts,
  flakyCases,
  passRateHistory,
  onOpenReports,
  onSelectFlakyCase,
}: {
  total: number
  counts: Partial<Record<Status, number>>
  flakyCases: FlakyCase[]
  passRateHistory: { passRate: number | null; createdAt: string }[]
  onOpenReports: () => void
  onSelectFlakyCase: (caseKey: string) => void
}) {
  const passRate = total > 0 ? Math.round(((counts.pass ?? 0) / total) * 100) : null
  const flakyCount = flakyCases.length
  const visibleFlakyCases = flakyCases.slice(0, FLAKY_ROWS_SHOWN)

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="text-primary">
            <BarChartIcon className="size-4" aria-hidden="true" />
          </span>
          Reports
        </span>
        <button
          type="button"
          aria-label="Open Reports"
          onClick={onOpenReports}
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          Open Reports ›
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-6 p-4">
        {passRate === null ? (
          <p className="text-sm text-muted-foreground">No runs yet — its status breakdown will appear here once one exists.</p>
        ) : (
          <div className="flex min-w-40 flex-1 items-center gap-3">
            <span className="text-xl font-black tracking-tight">{passRate}%</span>
            <div className="flex flex-1 flex-col gap-1">
              <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-border">
                {STATUS_ORDER.filter((status) => (counts[status] ?? 0) > 0).map((status) => (
                  <span
                    key={status}
                    className="h-full"
                    style={{ width: `${((counts[status] ?? 0) / total) * 100}%`, background: STATUS_COLOR[status] }}
                  />
                ))}
              </span>
              <span className="text-xs text-muted-foreground">pass · {total} items</span>
            </div>
            {passRateHistory.length > 0 && (
              <div aria-label="Pass rate trend" className="flex h-6 items-end gap-0.5">
                {passRateHistory.map((point, i) => (
                  <span
                    key={i}
                    className="w-1.5 min-h-0.5 rounded-sm"
                    style={{ height: `${point.passRate ?? 0}%`, background: 'var(--chart-1)' }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {flakyCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
              {flakyCount} flaky
            </span>
            <span className="text-muted-foreground">case{flakyCount === 1 ? '' : 's'} to watch</span>
          </span>
        )}
      </div>
      {flakyCount > 0 && (
        <ul aria-label="Flaky cases" className="border-t border-border">
          {visibleFlakyCases.map((c) => (
            <li key={c.caseKey} className="border-b border-border last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent"
                onClick={() => onSelectFlakyCase(c.caseKey)}
              >
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{c.caseTitle}</span>
                <span className="shrink-0 font-semibold tabular-nums text-destructive">{c.rate}%</span>
              </button>
            </li>
          ))}
          {flakyCount > FLAKY_ROWS_SHOWN && (
            <li className="border-b-0">
              <button
                type="button"
                aria-label="See all flaky cases"
                onClick={onOpenReports}
                className="w-full px-4 py-2 text-left text-xs font-semibold text-primary hover:underline"
              >
                see all {flakyCount} ›
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
