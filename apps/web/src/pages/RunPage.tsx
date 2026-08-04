import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowRightIcon, ExternalLinkIcon, LayersIcon, UserPlusIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { avatarStyle, initialsFor } from '@/lib/avatar'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { StatusBadge, dotClass } from '@/components/StatusBadge'
import { RunStatusBreakdown, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '@/components/RunStatusBreakdown'
import { RowActionMenu, type RowActionMenuHandle, type RowActionMenuItem } from '@/components/RowActionMenu'
import { ConfirmBanner } from '@/components/ConfirmBanner'
import { RunShortcutsHint, RunShortcutsOverlay, type ShortcutEntry } from '@/components/RunShortcuts'
import { AssignDialog, type AssigneePick } from '@/components/AssignDialog'
import { RunBulkActionBar, type BulkAction } from '@/components/RunBulkActionBar'
import { assignRunItems } from '@/lib/assignRunItems'
import { recordBulkVerdict } from '@/lib/recordBulkVerdict'
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
type Verdict = components['schemas']['Verdict']

function RunItemRow({
  item,
  projectKey,
  focused,
  selected,
  selectedCount,
  onToggleSelect,
  onOpenExecution,
  onGoToCase,
  onAssign,
  onAssignSelected,
  bulkVerdictItems,
}: {
  item: RunItem
  projectKey?: string
  focused?: boolean
  selected: boolean
  selectedCount: number
  onToggleSelect: (shiftKey: boolean) => void
  onOpenExecution: () => void
  onGoToCase: () => void
  onAssign: () => void
  onAssignSelected: () => void
  bulkVerdictItems: RowActionMenuItem[]
}) {
  const menuRef = useRef<RowActionMenuHandle>(null)
  const shiftHeldRef = useRef(false)
  // Right-clicking (or opening the ⋯ menu on) a row that's part of a
  // multi-item selection acts on the whole selection instead of just this
  // row — the checkbox selection itself is never touched by opening the
  // menu. A lone checked row (selectedCount === 1) still gets the ordinary
  // single-item menu, since "bulk" only means something once there's a
  // real multi-selection.
  const isBulkContext = selected && selectedCount > 1
  const menuItems: RowActionMenuItem[] = isBulkContext
    ? [
        {
          label: `Assign ${selectedCount} selected…`,
          icon: <UserPlusIcon className="size-4" aria-hidden="true" />,
          onSelect: onAssignSelected,
        },
        ...bulkVerdictItems.map((verdictItem, index) => (index === 0 ? { ...verdictItem, dividerBefore: true } : verdictItem)),
      ]
    : [
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
          onClick={(e) => {
            shiftHeldRef.current = e.shiftKey
          }}
          onChange={() => onToggleSelect(shiftHeldRef.current)}
          className={`size-4 shrink-0 rounded border-input transition-opacity hover:opacity-100 ${
            focused || selectedCount > 0 ? 'opacity-100' : 'opacity-40'
          }`}
        />
        <button
          type="button"
          onClick={onOpenExecution}
          data-focused={focused ? 'true' : undefined}
          className={`relative flex flex-1 items-center justify-between overflow-hidden rounded-md border px-3 py-2 text-left text-sm hover:bg-accent dark:bg-card/40 ${focused ? 'bg-accent' : ''}`}
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
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {item.assignee ? (
                item.assignee.kind === 'team' ? (
                  <span
                    className="flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold"
                    style={avatarStyle(item.assignee.name)}
                  >
                    {initialsFor(item.assignee.name)}
                  </span>
                ) : (
                  <Avatar
                    seed={item.assignee.name}
                    avatarKey={item.assignee.avatarKey}
                    userId={item.assignee.id}
                    className="size-4 rounded-full text-[9px]"
                  />
                )
              ) : (
                <span
                  className="size-4 shrink-0 rounded-full border border-dashed border-muted-foreground/40"
                  aria-hidden="true"
                />
              )}
              {item.assignee?.name ?? 'Unassigned'}
            </span>
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
  const [assignTarget, setAssignTarget] = useState<{ itemIds: string[] } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastToggledId, setLastToggledId] = useState<string | null>(null)
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
          (assigneeFilter === null ||
            (assigneeFilter === '' ? !item.assignee : item.assignee?.id === assigneeFilter)),
      ),
    [items, activeFilter, assigneeFilter],
  )

  const presentStatuses = useMemo(
    () => STATUS_ORDER.filter((status) => (summary?.counts?.[status] ?? 0) > 0),
    [summary],
  )

  const distinctAssignees = useMemo(() => {
    const byId = new Map<string, string>()
    for (const item of items) {
      if (item.assignee) byId.set(item.assignee.id, item.assignee.name)
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  async function handleAssign(itemIds: string[], assignee: AssigneePick) {
    await assignRunItems(itemIds, assignee)
    setItems((prev) =>
      prev.map((item) =>
        itemIds.includes(item.id)
          ? { ...item, assignee: { kind: assignee.kind, id: assignee.id, name: assignee.label } }
          : item,
      ),
    )
    setSelectedIds(new Set())
  }

  async function handleBulkVerdict(verdict: Verdict) {
    await recordBulkVerdict(Array.from(selectedIds), verdict)
    setSelectedIds(new Set())
    await load()
  }

  function toggleSelect(itemId: string, shiftKey = false) {
    if (shiftKey && lastToggledId) {
      const ids = displayOrder.map((item) => item.id)
      const fromIndex = ids.indexOf(lastToggledId)
      const toIndex = ids.indexOf(itemId)
      if (fromIndex !== -1 && toIndex !== -1) {
        const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
        const rangeIds = ids.slice(start, end + 1)
        setSelectedIds((prev) => new Set([...prev, ...rangeIds]))
        setLastToggledId(itemId)
        return
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
    setLastToggledId(itemId)
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
      if (key === ' ') {
        e.preventDefault()
        const target = displayOrder[focusedIndex]
        if (target) toggleSelect(target.id)
        return
      }
      if (e.key === 'Enter') {
        const target = displayOrder[focusedIndex]
        if (target) navigate(`/runs/${runKey}/items/${target.caseKey}`)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [displayOrder, focusedIndex, runKey, navigate, toggleSelect])

  const runShortcuts: ShortcutEntry[] = [
    { keys: 'J/K · ↑/↓', label: 'Move selection' },
    { keys: 'Enter', label: 'Open selected item' },
  ]

  function handleAssignSelected() {
    setAssignTarget({ itemIds: Array.from(selectedIds) })
  }

  const verdictMenuItems: RowActionMenuItem[] =
    run?.status === 'open'
      ? (['pass', 'failed', 'blocked', 'skipped'] as const).map((verdict) => ({
          label: STATUS_LABEL[verdict],
          icon: <span className={`size-2 rounded-full ${dotClass[verdict]}`} aria-hidden="true" />,
          onSelect: () => void handleBulkVerdict(verdict),
        }))
      : []

  const bulkActions: BulkAction[] = [
    { kind: 'button', label: 'Assign selected…', onSelect: handleAssignSelected },
    ...(verdictMenuItems.length > 0 ? ([{ kind: 'menu', label: 'Mark as', items: verdictMenuItems }] satisfies BulkAction[]) : []),
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
                  key={assignee.id}
                  type="button"
                  aria-pressed={assigneeFilter === assignee.id}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${assigneeFilter === assignee.id ? 'border-primary bg-accent text-primary' : 'border-input text-muted-foreground'}`}
                  onClick={() => setAssigneeFilter(assignee.id)}
                >
                  {assignee.name}
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
          <RunBulkActionBar count={selectedIds.size} actions={bulkActions} onClear={() => setSelectedIds(new Set())} />
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
                          selectedCount={selectedIds.size}
                          onToggleSelect={(shiftKey) => toggleSelect(item.id, shiftKey)}
                          onOpenExecution={() => navigate(`/runs/${runKey}/items/${item.caseKey}`)}
                          onGoToCase={() => project && navigate(`/projects/${project.key}/cases/${item.caseKey}`)}
                          onAssign={() => setAssignTarget({ itemIds: [item.id] })}
                          onAssignSelected={handleAssignSelected}
                          bulkVerdictItems={verdictMenuItems}
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
                  selectedCount={selectedIds.size}
                  onToggleSelect={(shiftKey) => toggleSelect(item.id, shiftKey)}
                  onOpenExecution={() => navigate(`/runs/${runKey}/items/${item.caseKey}`)}
                  onGoToCase={() => project && navigate(`/projects/${project.key}/cases/${item.caseKey}`)}
                  onAssign={() => setAssignTarget({ itemIds: [item.id] })}
                  onAssignSelected={handleAssignSelected}
                  bulkVerdictItems={verdictMenuItems}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {projectKey && (
        <AssignDialog
          open={assignTarget !== null}
          onOpenChange={(open) => !open && setAssignTarget(null)}
          projectKey={projectKey}
          title={assignTarget && assignTarget.itemIds.length > 1 ? `Assign ${assignTarget.itemIds.length} items to…` : 'Assign to…'}
          onAssign={(assignee) => {
            if (assignTarget) void handleAssign(assignTarget.itemIds, assignee)
          }}
        />
      )}

      <RunShortcutsHint shortcuts={runShortcuts} />
      <RunShortcutsOverlay shortcuts={runShortcuts} />
    </div>
  )
}
