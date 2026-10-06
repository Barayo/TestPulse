import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HealthBar } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'
import { RowActionMenu, type RowActionMenuHandle, type RowActionMenuItem } from '@/components/RowActionMenu'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']

// Closed can grow unbounded (CI dogfooding imports many automated runs on
// every push) — one shared cap/expand, not Closed-specific, so Open would
// be handled the same way if it ever ballooned too (group-runs-by-status).
export const SECTION_CAP = 10

// Shared between RunsPage.tsx (a project's full run list) and the suite
// detail page's Run history card (rework-suite-run-flow design.md D3) — one
// row/section implementation rather than two copies of the same idiom.
// projectKey is optional so a caller that hasn't wired the compare entry
// point through yet (or has no project context) simply gets no menu at all
// — hidden, not disabled, matching SuiteActionsMenu.tsx's own convention.
// showActions lets a caller that renders RunRow as an *option inside its own
// menu* (the comparison picker's listbox, design.md D9) suppress this row's
// own menu — a "Compare…" action inside the Compare picker would be circular.

// The name/health/date markup, factored out of RunRow's <Link> wrapper so the
// comparison picker's listbox (design.md D9) can reuse the same visual row
// inside a role="option" element instead of a Link — an anchor's navigation
// semantics don't belong inside a selection control.
export function RunRowContent({ run }: { run: Run }) {
  const { t } = useTranslation()
  return (
    <>
      <span className="min-w-0 flex-1 truncate font-medium">{run.name}</span>
      <span className="w-20 shrink-0">
        {run.passRate === null || run.passRate === undefined ? (
          <span className="text-xs text-muted-foreground">{t('RunList.notRunYet')}</span>
        ) : (
          <HealthBar rate={run.passRate} />
        )}
      </span>
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{timeAgo(run.createdAt)}</span>
    </>
  )
}

export function RunRow({
  run,
  projectKey,
  showActions = true,
}: {
  run: Run
  projectKey?: string
  showActions?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const menuRef = useRef<RowActionMenuHandle>(null)
  const showMenu = showActions && Boolean(projectKey) && run.status === 'closed'

  const menuItems: RowActionMenuItem[] = showMenu
    ? [
        {
          label: t('RunList.compareLabel'),
          onSelect: () =>
            navigate(`/projects/${projectKey}/runs/compare`, { state: { seedRunKey: run.key } }),
        },
      ]
    : []

  return (
    <div
      className="flex items-center gap-1"
      onContextMenu={(e) => {
        if (!showMenu) return
        e.preventDefault()
        menuRef.current?.openAt(e.clientX, e.clientY)
      }}
    >
      <Link
        to={`/runs/${run.key}`}
        aria-label={run.name}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
      >
        <RunRowContent run={run} />
      </Link>
      {showMenu && <RowActionMenu ref={menuRef} label={t('RunList.actionsForRunAriaLabel', { name: run.name })} items={menuItems} />}
    </div>
  )
}

export function RunSection({
  title,
  variant,
  runs,
  emptyMessage,
  recessed,
  projectKey,
}: {
  title: string
  variant: 'secondary' | 'outline'
  runs: Run[]
  emptyMessage: string
  recessed?: boolean
  projectKey?: string
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? runs : runs.slice(0, SECTION_CAP)
  const remaining = runs.length - visible.length

  return (
    <div className={recessed ? 'rounded-xl bg-muted/40 p-3' : ''}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Badge variant={variant}>{title}</Badge>
        <span className="text-xs text-muted-foreground">{runs.length}</span>
      </div>
      {runs.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-0.5">
          {visible.map((r) => (
            <li key={r.id}>
              <RunRow run={r} projectKey={projectKey} />
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
            {remaining === 1
              ? t('RunList.showMoreRunsSingular', { count: remaining, title: title.toLowerCase() })
              : t('RunList.showMoreRunsPlural', { count: remaining, title: title.toLowerCase() })}
          </Button>
        </div>
      )}
    </div>
  )
}
