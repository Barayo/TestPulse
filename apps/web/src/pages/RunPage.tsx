import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowRightIcon, ExternalLinkIcon, LayersIcon, UserPlusIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { StatusBadge } from '@/components/StatusBadge'
import { RunStatusBreakdown, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '@/components/RunStatusBreakdown'
import { RowActionMenu, type RowActionMenuHandle, type RowActionMenuItem } from '@/components/RowActionMenu'
import { ConfirmBanner } from '@/components/ConfirmBanner'
import { RunShortcutsHint, RunShortcutsOverlay, type ShortcutEntry } from '@/components/RunShortcuts'
import { AssignDialog } from '@/components/AssignDialog'
import { RunBulkActionBar } from '@/components/RunBulkActionBar'
import { assignRunItems } from '@/lib/assignRunItems'
import { isEditableElementFocused } from '@/lib/keyboardShortcutGuard'
import { useBumpDataRevision } from '@/lib/DataRevision'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type RunItem = components['schemas']['RunItem']
type RunSummary = components['schemas']['RunSummary']
type Project = components['schemas']['Project']
type Suite = components['schemas']['Suite']
type Status = components['schemas']['Status']

function RunItemRow({
  item,
  projectKey,
  focused,
  selected,
  onToggleSelect,
  onOpenExecution,
  onGoToCase,
  onAssign,
}: {
  item: RunItem
  projectKey?: string
  focused?: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpenExecution: () => void
  onGoToCase: () => void
  onAssign: () => void
}) {
  const menuRef = useRef<RowActionMenuHandle>(null)
  const menuItems: RowActionMenuItem[] = [
    { label: 'Open execution', icon: <ArrowRightIcon className="size-4" aria-hidden="true" />, onSelect: onOpenExecution },
    { label: 'Go to case in Library', icon: <ExternalLinkIcon className="size-4" aria-hidden="true" />, onSelect: onGoToCase },
    { label: 'Assign to…', icon: <UserPlusIcon className="size-4" aria-hidden="true" />, onSelect: onAssign },
  ]

  return (
    <li
      onContextMenu={(e) => {
        if (!projectKey) return
        e.preventDefault()
        menuRef.current?.openAt(e.clientX, e.clientY)
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label={`Select ${item.content.title}`}
          checked={selected}
          onChange={onToggleSelect}
          className="size-4 shrink-0 rounded border-input"
        />
        <button
          type="button"
          onClick={onOpenExecution}
          data-focused={focused ? 'true' : undefined}
          className={`relative flex flex-1 items-center justify-between overflow-hidden rounded-md border px-3 py-2 text-left text-sm hover:bg-accent ${focused ? 'bg-accent' : ''}`}
        >
          {focused && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />}
          <span className="flex flex-col gap-0.5">
            <span>
              {item.content.title}
              {item.newerVersion && (
                <span className="ml-2 text-xs text-muted-foreground">(newer version available)</span>
              )}
            </span>
            {(item.testName || item.content.platform || item.content.tags?.length) && (
              <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {item.testName && <span>{item.testName}</span>}
                {item.content.platform && <span>{item.content.platform}</span>}
                {item.content.tags?.map((tag) => <span key={tag}>{tag}</span>)}
              </span>
            )}
          </span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{item.assignee || 'Unassigned'}</span>
            <StatusBadge status={item.currentStatus} />
          </span>
        </button>
        {projectKey && <RowActionMenu ref={menuRef} label={`Actions for ${item.content.title}`} items={menuItems} />}
      </div>
    </li>
  )
}

export default function RunPage() {
  const { runKey } = useParams<{ runKey: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [run, setRun] = useState<Run>()
  const [notFound, setNotFound] = useState(false)
  const [project, setProject] = useState<Project>()
  const [suite, setSuite] = useState<Suite>()
  const [items, setItems] = useState<RunItem[]>([])
  const [summary, setSummary] = useState<RunSummary>()
  const [lifecycleError, setLifecycleError] = useState<string>()
  const [isClosing, setIsClosing] = useState(false)
  const [isReopening, setIsReopening] = useState(false)
  const [activeFilter, setActiveFilter] = useState<Status | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null)
  const [groupEnabled, setGroupEnabled] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [assignTarget, setAssignTarget] = useState<{ itemIds: string[]; currentAssignee?: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const bumpDataRevision = useBumpDataRevision()

  // One-shot confirmation after navigating here from NewRunPage on creation
  // (rework-runs-list-ux) — same idiom as RunsPage's old seedFromSuiteKey:
  // read router state once, then clear it so a refresh doesn't re-show it.
  const [showCreatedBanner, setShowCreatedBanner] = useState(
    Boolean((location.state as { justCreated?: boolean } | null)?.justCreated),
  )
  useEffect(() => {
    if (!showCreatedBanner) return
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    if (!runKey) return
    setNotFound(false)
    try {
      const [{ data: r }, { data: i }, { data: s }] = await Promise.all([
        api.GET('/api/v1/runs/{runKey}', { params: { path: { runKey } } }),
        api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey } } }),
        api.GET('/api/v1/runs/{runKey}/summary', { params: { path: { runKey } } }),
      ])
      if (!r) {
        setNotFound(true)
        return
      }
      setRun(r)
      setItems(i ?? [])
      setSummary(s)
    } catch {
      setItems([])
    }
  }, [runKey])

  const projectKey = run?.projectKey
  useEffect(() => {
    if (!projectKey) return
    api
      .GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
      .then(({ data }) => setProject(data))
      .catch(() => setProject(undefined))
  }, [projectKey])

  const suiteKey = run?.suiteKey
  useEffect(() => {
    if (!suiteKey) {
      setSuite(undefined)
      return
    }
    api
      .GET('/api/v1/suites/{suiteKey}', { params: { path: { suiteKey } } })
      .then(({ data }) => setSuite(data))
      .catch(() => setSuite(undefined))
  }, [suiteKey])

  useEffect(() => {
    void load()
  }, [load])

  async function closeRun() {
    if (!runKey) return
    setLifecycleError(undefined)
    setIsClosing(true)
    const { error } = await api.POST('/api/v1/runs/{runKey}/close', { params: { path: { runKey } } })
    setIsClosing(false)
    if (error) {
      setLifecycleError('Could not close this run.')
      return
    }
    setRun((r) => (r ? { ...r, status: 'closed' } : r))
    bumpDataRevision()
  }

  async function reopenRun() {
    if (!runKey) return
    setLifecycleError(undefined)
    setIsReopening(true)
    const { error } = await api.POST('/api/v1/runs/{runKey}/reopen', { params: { path: { runKey } } })
    setIsReopening(false)
    if (error) {
      setLifecycleError("You don't have permission to reopen this run — ask a project admin.")
      return
    }
    setRun((r) => (r ? { ...r, status: 'open' } : r))
    bumpDataRevision()
  }

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (activeFilter === null || item.currentStatus === activeFilter) &&
          (assigneeFilter === null || (assigneeFilter === '' ? !item.assignee : item.assignee === assigneeFilter)),
      ),
    [items, activeFilter, assigneeFilter],
  )

  const presentStatuses = useMemo(
    () => STATUS_ORDER.filter((status) => (summary?.counts?.[status] ?? 0) > 0),
    [summary],
  )

  const distinctAssignees = useMemo(
    () => Array.from(new Set(items.map((item) => item.assignee).filter((a): a is string => Boolean(a)))).sort(),
    [items],
  )

  async function handleAssign(itemIds: string[], assignee: string) {
    await assignRunItems(itemIds, assignee)
    setItems((prev) => prev.map((item) => (itemIds.includes(item.id) ? { ...item, assignee } : item)))
    setSelectedIds(new Set())
  }

  function toggleSelect(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id))
  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleItems.map((item) => item.id)))
  }

  const displayOrder = useMemo(
    () =>
      groupEnabled
        ? STATUS_ORDER.flatMap((status) => visibleItems.filter((item) => item.currentStatus === status))
        : visibleItems,
    [visibleItems, groupEnabled],
  )

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableElementFocused()) return
      const key = e.key.toLowerCase()
      if (key === 'j' || key === 'arrowdown') {
        setFocusedIndex((i) => Math.min(i + 1, displayOrder.length - 1))
        return
      }
      if (key === 'k' || key === 'arrowup') {
        setFocusedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        const target = displayOrder[focusedIndex]
        if (target) navigate(`/runs/${runKey}/items/${target.caseKey}`)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [displayOrder, focusedIndex, runKey, navigate])

  const runShortcuts: ShortcutEntry[] = [
    { keys: 'J/K · ↑/↓', label: 'Move selection' },
    { keys: 'Enter', label: 'Open selected item' },
  ]

  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Run not found. <Link to="/" className="underline">Go to Projects</Link>
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs
        segments={trimProjectBreadcrumb(
          [
            { label: 'Projects', href: '/' },
            { label: project?.name ?? '', href: project ? `/projects/${project.key}` : undefined },
            { label: run?.name ?? '' },
          ],
          run?.name,
        )}
      />
      {showCreatedBanner && (
        <ConfirmBanner message="Run created successfully" onDismiss={() => setShowCreatedBanner(false)} />
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="tp-heading">{run?.name ?? 'Run'}</CardTitle>
            {run && (
              <div className="flex items-center gap-2">
                <Badge variant={run.status === 'open' ? 'secondary' : 'outline'}>{run.status}</Badge>
                {run.status === 'open' ? (
                  <Button size="sm" variant="outline" disabled={isClosing} onClick={() => void closeRun()}>
                    {isClosing ? 'Closing…' : 'Close run'}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={isReopening} onClick={() => void reopenRun()}>
                    {isReopening ? 'Reopening…' : 'Reopen'}
                  </Button>
                )}
              </div>
            )}
          </div>
          {lifecycleError && <p className="text-sm text-destructive">{lifecycleError}</p>}
          {run && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {run.suiteKey ? (
                <Link
                  to={`/projects/${projectKey}/suites/${run.suiteKey}`}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <LayersIcon className="size-3.5" aria-hidden="true" />
                  From suite: {suite?.name ?? run.suiteKey}
                </Link>
              ) : (
                <span>Ad hoc run — not created from a suite</span>
              )}
              <span aria-hidden="true">&middot;</span>
              <span>Created {new Date(run.createdAt).toLocaleDateString()}</span>
            </div>
          )}
          {summary && <RunStatusBreakdown total={summary.total} counts={summary.counts} />}
          {summary && summary.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Filter items by status" className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={activeFilter === null}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${activeFilter === null ? 'border-primary bg-accent text-primary' : 'border-input text-muted-foreground'}`}
                  onClick={() => setActiveFilter(null)}
                >
                  All <span className="ml-1 text-[0.7rem]">{summary.total}</span>
                </button>
                {presentStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={activeFilter === status}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${activeFilter === status ? 'border-primary bg-accent text-primary' : 'border-input text-muted-foreground'}`}
                    onClick={() => setActiveFilter(status)}
                  >
                    <span aria-hidden="true" className="size-2 rounded-sm" style={{ background: STATUS_COLOR[status] }} />
                    {STATUS_LABEL[status]} <span className="text-[0.7rem]">{summary.counts?.[status] ?? 0}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={groupEnabled}
                aria-label="Group by status"
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${groupEnabled ? 'border-primary text-primary' : 'border-input text-muted-foreground'}`}
                onClick={() => setGroupEnabled((v) => !v)}
              >
                Group by status
              </button>
            </div>
          )}
          {summary && summary.total > 0 && (
            <div role="group" aria-label="Filter items by assignee" className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={assigneeFilter === null}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${assigneeFilter === null ? 'border-primary bg-accent text-primary' : 'border-input text-muted-foreground'}`}
                onClick={() => setAssigneeFilter(null)}
              >
                All
              </button>
              {distinctAssignees.map((assignee) => (
                <button
                  key={assignee}
                  type="button"
                  aria-pressed={assigneeFilter === assignee}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${assigneeFilter === assignee ? 'border-primary bg-accent text-primary' : 'border-input text-muted-foreground'}`}
                  onClick={() => setAssigneeFilter(assignee)}
                >
                  {assignee}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={assigneeFilter === ''}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${assigneeFilter === '' ? 'border-primary bg-accent text-primary' : 'border-input text-muted-foreground'}`}
                onClick={() => setAssigneeFilter('')}
              >
                Unassigned
              </button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {summary && summary.total > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="size-4 shrink-0 rounded border-input"
              />
              <p>
                {`Showing ${visibleItems.length} of ${summary.total} items`}
                {activeFilter && ` — filtered to ${STATUS_LABEL[activeFilter].toLowerCase()}`}
              </p>
            </div>
          )}
          <RunBulkActionBar
            count={selectedIds.size}
            actions={[
              {
                label: 'Assign selected…',
                onSelect: () => setAssignTarget({ itemIds: Array.from(selectedIds) }),
              },
            ]}
            onClear={() => setSelectedIds(new Set())}
          />
          {visibleItems.length === 0 && summary && summary.total > 0 ? (
            <p className="text-sm text-muted-foreground">No items match this filter.</p>
          ) : groupEnabled ? (
            <div className="space-y-4">
              {STATUS_ORDER.map((status) => {
                const group = visibleItems.filter((item) => item.currentStatus === status)
                if (group.length === 0) return null
                return (
                  <div key={status} className="space-y-2">
                    <p className="tp-label flex items-center gap-2">
                      <span>
                        {STATUS_LABEL[status]} &middot; {group.length}
                      </span>
                      <span className="h-px flex-1 bg-border" aria-hidden="true" />
                    </p>
                    <ul className="space-y-2">
                      {group.map((item) => (
                        <RunItemRow
                          key={item.id}
                          item={item}
                          projectKey={project?.key}
                          focused={displayOrder[focusedIndex]?.id === item.id}
                          selected={selectedIds.has(item.id)}
                          onToggleSelect={() => toggleSelect(item.id)}
                          onOpenExecution={() => navigate(`/runs/${runKey}/items/${item.caseKey}`)}
                          onGoToCase={() => project && navigate(`/projects/${project.key}/cases/${item.caseKey}`)}
                          onAssign={() => setAssignTarget({ itemIds: [item.id], currentAssignee: item.assignee })}
                        />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleItems.map((item) => (
                <RunItemRow
                  key={item.id}
                  item={item}
                  projectKey={project?.key}
                  focused={displayOrder[focusedIndex]?.id === item.id}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onOpenExecution={() => navigate(`/runs/${runKey}/items/${item.caseKey}`)}
                  onGoToCase={() => project && navigate(`/projects/${project.key}/cases/${item.caseKey}`)}
                  onAssign={() => setAssignTarget({ itemIds: [item.id], currentAssignee: item.assignee })}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AssignDialog
        open={assignTarget !== null}
        onOpenChange={(open) => !open && setAssignTarget(null)}
        currentAssignee={assignTarget?.currentAssignee}
        suggestions={distinctAssignees}
        title={assignTarget && assignTarget.itemIds.length > 1 ? `Assign ${assignTarget.itemIds.length} items to…` : 'Assign to…'}
        onAssign={(assignee) => {
          if (assignTarget) void handleAssign(assignTarget.itemIds, assignee)
        }}
      />

      <RunShortcutsHint shortcuts={runShortcuts} />
      <RunShortcutsOverlay shortcuts={runShortcuts} />
    </div>
  )
}
