import { FolderIcon, LayersIcon, CirclePlayIcon } from 'lucide-react'
import type { LandingFolder, LandingSuite, LandingRun } from '@/lib/useProjectLanding'

function healthColor(rate: number): string {
  if (rate >= 80) return 'bg-primary'
  if (rate >= 50) return 'bg-secondary'
  return 'bg-destructive'
}

function HealthBar({ rate }: { rate: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-1 w-9 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full ${healthColor(rate)}`} style={{ width: `${rate}%` }} />
      </span>
      {rate}%
    </span>
  )
}

function PanelShell({
  icon,
  title,
  seeAllLabel,
  seeAllAriaLabel,
  onSeeAll,
  isEmpty,
  emptyLabel,
  children,
}: {
  icon: React.ReactNode
  title: string
  seeAllLabel: string
  seeAllAriaLabel: string
  onSeeAll: () => void
  isEmpty: boolean
  emptyLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        aria-label={seeAllAriaLabel}
        className="flex w-full items-center justify-between border-b bg-muted/40 px-3 py-2 text-left hover:bg-muted/60"
        onClick={onSeeAll}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {icon}
          {title}
        </span>
        <span className="text-xs text-muted-foreground underline">{seeAllLabel}</span>
      </button>
      {isEmpty ? (
        <p className="p-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </div>
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
  return (
    <PanelShell
      icon={<FolderIcon className="size-3.5" />}
      title="Library"
      seeAllLabel={totalCount > 0 ? `see all ${totalCount} ›` : 'go to Library ›'}
      seeAllAriaLabel="Go to Library"
      onSeeAll={onSeeAll}
      isEmpty={folders.length === 0}
      emptyLabel="No sections yet · create the first one to organize your test cases."
    >
      {folders.map((f) => (
        <li key={f.id} className="border-b px-3 py-2 text-sm last:border-b-0">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left hover:text-foreground"
            onClick={() => onSelectFolder(f.id)}
          >
            <span className="truncate">{f.name}</span>
            <span className="text-muted-foreground">{f.caseCount}</span>
          </button>
        </li>
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
      icon={<LayersIcon className="size-3.5" />}
      title="Suites"
      seeAllLabel={totalCount > 0 ? `see all ${totalCount} ›` : 'go to Suites ›'}
      seeAllAriaLabel="Go to Suites"
      onSeeAll={onSeeAll}
      isEmpty={suites.length === 0}
      emptyLabel="No suites yet · create the first one to group test cases."
    >
      {suites.map((s) => (
        <li key={s.id} className="border-b px-3 py-2 text-sm last:border-b-0">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left hover:text-foreground"
            onClick={() => onSelectSuite(s.id)}
          >
            <span className="truncate">{s.name}</span>
            <span className="text-muted-foreground">{s.caseCount}</span>
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
      icon={<CirclePlayIcon className="size-3.5" />}
      title="Recent runs"
      seeAllLabel={totalCount > 0 ? 'see all ›' : 'go to Runs ›'}
      seeAllAriaLabel="Go to Runs"
      onSeeAll={onSeeAll}
      isEmpty={runs.length === 0}
      emptyLabel="No runs yet."
    >
      {runs.map((r) => (
        <li key={r.id} className="border-b px-3 py-2 text-sm last:border-b-0">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left hover:text-foreground"
            onClick={() => onSelectRun(r.id)}
          >
            <span className="truncate">{r.name}</span>
            <span className="text-muted-foreground">
              {r.passRate === null ? 'not run yet' : <HealthBar rate={r.passRate} />}
            </span>
          </button>
        </li>
      ))}
    </PanelShell>
  )
}
