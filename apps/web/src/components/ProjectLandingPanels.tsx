import { useState } from 'react'
import { FolderIcon, LayersIcon, CirclePlayIcon, ChevronRightIcon } from 'lucide-react'
import type { LandingFolder, LandingSuite, LandingRun } from '@/lib/useProjectLanding'
import { HealthBar, healthColorVar, statusBorderClass } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'

function PanelShell({
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
  onSeeAll,
  onSelectFolder,
}: {
  folders: LandingFolder[]
  totalCount: number
  onSeeAll: () => void
  onSelectFolder: (folderId: string) => void
}) {
  const maxCaseCount = Math.max(1, ...folders.map((f) => f.caseCount))
  return (
    <PanelShell
      icon={<FolderIcon className="size-4" aria-hidden="true" />}
      title="Library"
      seeAllLabel={totalCount > 0 ? `see all ${totalCount} ›` : 'go to Library ›'}
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
  onSeeAll,
  onSelectSuite,
}: {
  suites: LandingSuite[]
  totalCount: number
  onSeeAll: () => void
  onSelectSuite: (suiteId: string) => void
}) {
  return (
    <PanelShell
      icon={<LayersIcon className="size-4" aria-hidden="true" />}
      title="Suites"
      seeAllLabel={totalCount > 0 ? `see all ${totalCount} ›` : 'go to Suites ›'}
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
