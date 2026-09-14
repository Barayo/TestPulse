import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowRightIcon, ExternalLinkIcon, LayersIcon, Loader2Icon, RotateCcwIcon, UserPlusIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { avatarStyle, initialsFor } from '@/lib/avatar'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
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
import { runItemUrl } from '@/lib/runItemUrl'
import { isEditableElementFocused } from '@/lib/keyboardShortcutGuard'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import { JiraLinkBadge } from '@/components/JiraLinkBadge'
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

// Bounds ensureAllItemsLoaded's background drain (security review,
// add-cursor-pagination task 12.1d) — looping until `nextCursor` is null
// with no ceiling reintroduces the unbounded-query problem pagination was
// meant to fix, just moved client-side. At the default page size (50),
// 25 pages caps a single drain at 1,250 items.
const MAX_DRAIN_PAGES = 25

// Shared by the bulk "Mark as" menu and a single row's own context menu
// (add-run-row-status-actions) — same labels/dot icons either way, only
// the onSelect callback (and what it's bound to) differs.
function buildVerdictMenuItems(onVerdict: (verdict: Verdict) => void): RowActionMenuItem[] {
  return (['pass', 'failed', 'blocked', 'skipped'] as const).map((verdict) => ({
    label: STATUS_LABEL[verdict],
    icon: <span className={`size-2 rounded-full ${dotClass[verdict]}`} aria-hidden="true" />,
    onSelect: () => onVerdict(verdict),
  }))
}

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
  onItemVerdict,
  onRetest,
  bulkVerdictItems,
  canRecord,
  jiraSiteUrl,
  onSaveJiraLink,
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
  onItemVerdict: (verdict: Verdict) => void
  onRetest: () => void
  bulkVerdictItems: RowActionMenuItem[]
  // Assign-to and bulk-verdict actions require runRecordResult; "Open
  // execution"/"Go to case" are pure navigation, never gated
  // (unify-authenticated-and-public-views tasks.md 2.5).
  canRecord: boolean
  jiraSiteUrl: string
  onSaveJiraLink: (itemId: string, jiraIssueKey: string | null) => void | Promise<void>
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
        ...(canRecord
          ? [
              {
                label: `Assign ${selectedCount} selected…`,
                icon: <UserPlusIcon className="size-4" aria-hidden="true" />,
                onSelect: onAssignSelected,
              } satisfies RowActionMenuItem,
            ]
          : []),
        ...bulkVerdictItems.map((verdictItem, index) => (index === 0 ? { ...verdictItem, dividerBefore: true } : verdictItem)),
      ]
    : [
        { label: 'Open execution', icon: <ArrowRightIcon className="size-4" aria-hidden="true" />, onSelect: onOpenExecution },
        { label: 'Go to case in Library', icon: <ExternalLinkIcon className="size-4" aria-hidden="true" />, onSelect: onGoToCase },
        ...(canRecord
          ? [
              {
                label: 'Assign to…',
                icon: <UserPlusIcon className="size-4" aria-hidden="true" />,
                onSelect: onAssign,
              } satisfies RowActionMenuItem,
            ]
          : []),
        // Same items a multi-selection's bulk menu already offers (same
        // gating: bulkVerdictItems is only non-empty when the run is open
        // and the caller can record results), just bound to this one row
        // instead of the whole selection (add-run-row-status-actions
        // design.md D1/D3).
        ...(bulkVerdictItems.length > 0
          ? buildVerdictMenuItems(onItemVerdict).map((verdictItem, index) => (index === 0 ? { ...verdictItem, dividerBefore: true } : verdictItem))
          : []),
        // Retest changes status directly rather than recording a verdict,
        // so it gets its own trailing divider and a distinct icon instead
        // of a verdict dot (design.md D3) — only offered for a row that's
        // actually failed, under the same run-open/permission gate.
        ...(bulkVerdictItems.length > 0 && item.currentStatus === 'failed'
          ? [
              {
                label: 'Retest',
                icon: <RotateCcwIcon className="size-4" aria-hidden="true" />,
                onSelect: onRetest,
                dividerBefore: true,
              } satisfies RowActionMenuItem,
            ]
          : []),
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
        <JiraLinkBadge
          variant="row"
          jiraIssueKey={item.jiraIssueKey}
          jiraIssueStatus={item.jiraIssueStatus}
          jiraLastSyncedAt={item.jiraLastSyncedAt}
          jiraBaseUrl={jiraSiteUrl}
          canEdit={canRecord}
          onSave={(key) => onSaveJiraLink(item.id, key)}
        />
        {projectKey && <RowActionMenu ref={menuRef} label={`Actions for ${item.content.title}`} items={menuItems} />}
      </div>
    </li>
  )
}

export default function RunPage() {
  const { runKey } = useParams<{ runKey: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, jiraSiteUrl } = useAuth()
  const [run, setRun] = useState<Run>()
  const [notFound, setNotFound] = useState(false)
  // Resolved by load()'s own run fetch (design.md D11) — a signed-in
  // non-member ends up 'public' here, same as an anonymous visitor.
  const [access, setAccess] = useState<'member' | 'public'>('public')
  const [project, setProject] = useState<Project>()
  const [suite, setSuite] = useState<Suite>()
  const [priorRunKey, setPriorRunKey] = useState<string>()
  const [items, setItems] = useState<RunItem[]>([])
  const [itemsCursor, setItemsCursor] = useState<string | null>(null)
  const [loadingMoreItems, setLoadingMoreItems] = useState(false)
  const [drainingItems, setDrainingItems] = useState(false)
  const [itemsTruncated, setItemsTruncated] = useState(false)
  const [summary, setSummary] = useState<RunSummary>()
  const [lifecycleError, setLifecycleError] = useState<string>()
  const [isClosing, setIsClosing] = useState(false)
  const [isReopening, setIsReopening] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
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
  const [recordFailureWarning, setRecordFailureWarning] = useState<string>()
  useEffect(() => {
    if (!showCreatedBanner) return
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    // Waits for the session check before firing either branch (design.md
    // D2, unify-authenticated-and-public-views).
    if (!runKey || authLoading) return
    setNotFound(false)
    try {
      let r, i, s
      let resolvedAccess: 'member' | 'public' = 'public'
      if (user) {
        const [runRes, itemsRes, summaryRes] = await Promise.all([
          api.GET('/api/v1/runs/{runKey}', { params: { path: { runKey } } }),
          api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey } } }),
          api.GET('/api/v1/runs/{runKey}/summary', { params: { path: { runKey } } }),
        ])
        if (runRes.data) {
          r = runRes.data
          i = itemsRes.data
          s = summaryRes.data
          resolvedAccess = 'member'
        } else {
          // Signed in but not a member (403) or the run doesn't exist
          // (404) — retry via the public branch before giving up
          // (design.md D11), the same fallback RunItemDetailPage uses:
          // projectKey isn't known until the run itself loads, so this
          // page can't pre-check access via useProjectReadAccess.
          const [pubRun, pubItems, pubSummary] = await Promise.all([
            api.GET('/api/v1/public/runs/{runKey}', { params: { path: { runKey } } }),
            api.GET('/api/v1/public/runs/{runKey}/items', { params: { path: { runKey } } }),
            api.GET('/api/v1/public/runs/{runKey}/summary', { params: { path: { runKey } } }),
          ])
          r = pubRun.data
          i = pubItems.data
          s = pubSummary.data
        }
      } else {
        const [pubRun, pubItems, pubSummary] = await Promise.all([
          api.GET('/api/v1/public/runs/{runKey}', { params: { path: { runKey } } }),
          api.GET('/api/v1/public/runs/{runKey}/items', { params: { path: { runKey } } }),
          api.GET('/api/v1/public/runs/{runKey}/summary', { params: { path: { runKey } } }),
        ])
        r = pubRun.data
        i = pubItems.data
        s = pubSummary.data
      }
      setAccess(resolvedAccess)
      if (!r) {
        setNotFound(true)
        return
      }
      setRun(r)
      setItems(i?.items ?? [])
      setItemsCursor(i?.nextCursor ?? null)
      setSummary(s)
    } catch {
      setItems([])
      setItemsCursor(null)
    }
  }, [runKey, user, authLoading])

  const fetchItemsPage = useCallback(
    (cursor?: string) =>
      (access === 'member'
        ? api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey: runKey! }, query: { cursor } } })
        : api.GET('/api/v1/public/runs/{runKey}/items', { params: { path: { runKey: runKey! }, query: { cursor } } })
      ).then(({ data }) => data ?? { items: [], nextCursor: null }),
    [runKey, access],
  )

  async function loadMoreItems() {
    if (!itemsCursor) return
    setLoadingMoreItems(true)
    try {
      const page = await fetchItemsPage(itemsCursor)
      setItems((prev) => [...prev, ...page.items])
      setItemsCursor(page.nextCursor)
    } finally {
      setLoadingMoreItems(false)
    }
  }

  // Filtering/grouping by status or assignee, and the "Group by status"
  // toggle, all imply "show me the complete accounting" — a partially
  // loaded page would silently undercount a status/assignee bucket, or
  // hide an assignee's filter chip entirely, until the reader happened to
  // click "Load more" first. Same data-completeness class as PeoplePage's
  // search-triggered drain: engaging any of these controls drains the
  // remaining pages in the background before trusting the narrowed view.
  //
  // itemsDrainRef guards against overlapping calls (bug found in QA,
  // 2026-09-07, same shape as PeoplePage's ensureAllUsersLoaded): every
  // filter/assignee chip click re-triggers this unconditionally, and
  // `itemsCursor` stays non-null until the *whole* drain finishes — so two
  // chips clicked before the first fetch resolves started two independent
  // drains, each re-fetching and re-appending the same page(s), producing
  // duplicate item ids (and the undefined React rendering that comes with
  // duplicate list keys). A second call while one is in flight now just
  // awaits the first call's own promise instead of starting a redundant one.
  const itemsDrainRef = useRef<Promise<void> | null>(null)
  function ensureAllItemsLoaded(): Promise<void> {
    if (itemsDrainRef.current) return itemsDrainRef.current
    if (!itemsCursor) return Promise.resolve()
    const drain = (async () => {
      setDrainingItems(true)
      try {
        let cursor: string | undefined = itemsCursor
        for (let pageCount = 0; cursor && pageCount < MAX_DRAIN_PAGES; pageCount++) {
          const page = await fetchItemsPage(cursor)
          setItems((prev) => [...prev, ...page.items])
          cursor = page.nextCursor ?? undefined
        }
        setItemsCursor(cursor ?? null)
        setItemsTruncated(Boolean(cursor))
      } finally {
        setDrainingItems(false)
        itemsDrainRef.current = null
      }
    })()
    itemsDrainRef.current = drain
    return drain
  }

  const projectKey = run?.projectKey
  const permissions = useProjectPermissions(projectKey)
  const canRecord = Boolean(permissions?.runRecordResult)
  useEffect(() => {
    if (!projectKey || authLoading) return
    const request = access === 'member'
      ? api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
      : api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } })
    request.then(({ data }) => setProject(data)).catch(() => setProject(undefined))
  }, [projectKey, access, authLoading])

  const suiteKey = run?.suiteKey
  useEffect(() => {
    if (!suiteKey || authLoading) {
      if (!suiteKey) setSuite(undefined)
      return
    }
    const request = access === 'member'
      ? api.GET('/api/v1/suites/{suiteKey}', { params: { path: { suiteKey } } })
      : api.GET('/api/v1/public/suites/{suiteKey}', { params: { path: { suiteKey } } })
    request.then(({ data }) => setSuite(data)).catch(() => setSuite(undefined))
  }, [suiteKey, access, authLoading])

  // "Compare to previous run" (add-run-comparison-view): the suite trend
  // (#77) already lists only closed runs, oldest→newest — the most recent
  // one created before this run is the "previous closed run" the quick
  // action needs. Resolved by creation time, not list position: this run
  // itself isn't in the trend at all while it's still open (the common
  // case right after creating it), so a position-based lookup would miss
  // it — date comparison against the run's own createdAt works either way.
  const runCreatedAt = run?.createdAt
  useEffect(() => {
    // Comparing always rejects an open run (test-execution's "Comparing an
    // open run is rejected") — a run that hasn't itself been closed yet has
    // no valid comparison to offer, regardless of what its suite's trend
    // contains (rework-suite-run-flow design.md D6: without this check, an
    // open run whose suite happened to have an earlier closed run showed a
    // link that always led to "Comparison not found").
    if (!suiteKey || !runKey || !runCreatedAt || authLoading || run?.status !== 'closed') {
      setPriorRunKey(undefined)
      return
    }
    const request = access === 'member'
      ? api.GET('/api/v1/suites/{suiteKey}/trend', { params: { path: { suiteKey } } })
      : api.GET('/api/v1/public/suites/{suiteKey}/trend', { params: { path: { suiteKey } } })
    request
      .then(({ data }) => {
        const thisRunTime = new Date(runCreatedAt).getTime()
        const prior = (data?.points ?? [])
          .filter((p) => p.runKey !== runKey && new Date(p.createdAt).getTime() < thisRunTime)
          .at(-1)
        setPriorRunKey(prior?.runKey)
      })
      .catch(() => setPriorRunKey(undefined))
  }, [suiteKey, runKey, runCreatedAt, run?.status, access, authLoading])

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

  async function confirmDeleteRun() {
    if (!runKey || !projectKey) return
    await api.DELETE('/api/v1/runs/{runKey}', { params: { path: { runKey } } })
    setDeleteDialogOpen(false)
    navigate(`/projects/${projectKey}/runs`)
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
    const { failedCount } = await recordBulkVerdict(Array.from(selectedIds), verdict)
    setSelectedIds(new Set())
    if (failedCount > 0) showRecordFailureWarning(failedCount)
    await load()
  }

  // recordBulkVerdict already generalizes cleanly to a single item — no
  // separate result-recording code path needed (add-run-row-status-actions
  // design.md D1).
  async function handleItemVerdict(itemId: string, verdict: Verdict) {
    const { failedCount } = await recordBulkVerdict([itemId], verdict)
    if (failedCount > 0) showRecordFailureWarning(failedCount)
    await load()
  }

  async function handleSaveJiraLink(itemId: string, jiraIssueKey: string | null) {
    await api.PUT('/api/v1/items/{itemId}/jira-link', {
      params: { path: { itemId } },
      body: { jiraIssueKey },
    })
    await load()
  }

  // openapi-fetch resolves rather than throws on a rejected item (e.g.
  // restrict-run-item-status-to-assignee's 403), so recordBulkVerdict would
  // otherwise silently no-op on it with no indication anything failed.
  function showRecordFailureWarning(failedCount: number) {
    setRecordFailureWarning(`${failedCount} item${failedCount === 1 ? '' : 's'} not updated — not assigned to you.`)
  }

  // Mirrors RunItemDetailPage.tsx's markRetest — sets status directly
  // rather than recording a verdict (design.md D2).
  async function handleRetest(itemId: string) {
    await api.PUT('/api/v1/items/{itemId}/status', {
      params: { path: { itemId } },
      body: { status: 'retest' },
    })
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
        if (target) navigate(runItemUrl(runKey!, target))
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
    run?.status === 'open' && canRecord ? buildVerdictMenuItems((verdict) => void handleBulkVerdict(verdict)) : []

  const bulkActions: BulkAction[] = [
    ...(canRecord ? ([{ kind: 'button', label: 'Assign selected…', onSelect: handleAssignSelected }] satisfies BulkAction[]) : []),
    ...(verdictMenuItems.length > 0 ? ([{ kind: 'menu', label: 'Mark as', items: verdictMenuItems }] satisfies BulkAction[]) : []),
  ]

  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Run not found. <Link to="/" className="underline">Go to Projects</Link>
        {!user && !authLoading && (
          <>
            {' '}
            ·{' '}
            <Link to="/login" state={{ from: `/runs/${runKey}` }} className="underline">
              Log in
            </Link>
          </>
        )}
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
      {showCreatedBanner && run && (
        <ConfirmBanner message={`Run "${run.name}" created.`} onDismiss={() => setShowCreatedBanner(false)} />
      )}
      {recordFailureWarning && (
        <ConfirmBanner message={recordFailureWarning} onDismiss={() => setRecordFailureWarning(undefined)} />
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="tp-heading">{run?.name ?? 'Run'}</CardTitle>
            {run && (
              <div className="flex items-center gap-2">
                {run.status === 'closed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate(`/projects/${run.projectKey}/runs/compare`, { state: { seedRunKey: run.key } })
                    }
                  >
                    Compare…
                  </Button>
                )}
                <Badge variant={run.status === 'open' ? 'secondary' : 'outline'}>{run.status}</Badge>
                {run.status === 'open'
                  ? canRecord && (
                      <Button size="sm" variant="outline" disabled={isClosing} onClick={() => void closeRun()}>
                        {isClosing ? 'Closing…' : 'Close run'}
                      </Button>
                    )
                  : permissions?.manageProject && (
                      <Button size="sm" variant="outline" disabled={isReopening} onClick={() => void reopenRun()}>
                        {isReopening ? 'Reopening…' : 'Reopen'}
                      </Button>
                    )}
                {permissions?.runDelete && (
                  <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                    Delete run
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
              {priorRunKey && (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <Link to={`/runs/compare/${priorRunKey}/${run.key}`} className="font-medium text-primary hover:underline">
                    Compare to previous run
                  </Link>
                </>
              )}
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
                    onClick={() => {
                      setActiveFilter(status)
                      void ensureAllItemsLoaded()
                    }}
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
                onClick={() => {
                  setGroupEnabled((v) => {
                    const next = !v
                    if (next) void ensureAllItemsLoaded()
                    return next
                  })
                }}
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
                  onClick={() => {
                    setAssigneeFilter(assignee.id)
                    void ensureAllItemsLoaded()
                  }}
                >
                  {assignee.name}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={assigneeFilter === ''}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${assigneeFilter === '' ? 'border-primary bg-accent text-primary' : 'border-input text-muted-foreground'}`}
                onClick={() => {
                  setAssigneeFilter('')
                  void ensureAllItemsLoaded()
                }}
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
          {drainingItems && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
              Loading remaining items to filter accurately…
            </p>
          )}
          {itemsTruncated && !drainingItems && (
            <p className="text-xs text-muted-foreground">
              This run has more items than can be filtered at once — some may be missing from the counts above.
            </p>
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
                          onOpenExecution={() => navigate(runItemUrl(runKey!, item))}
                          onGoToCase={() => project && navigate(`/projects/${project.key}/cases/${item.caseKey}`)}
                          onAssign={() => setAssignTarget({ itemIds: [item.id] })}
                          onAssignSelected={handleAssignSelected}
                          onItemVerdict={(verdict) => void handleItemVerdict(item.id, verdict)}
                          onRetest={() => void handleRetest(item.id)}
                          bulkVerdictItems={verdictMenuItems}
                          canRecord={canRecord}
                          jiraSiteUrl={jiraSiteUrl}
                          onSaveJiraLink={handleSaveJiraLink}
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
                  onOpenExecution={() => navigate(runItemUrl(runKey!, item))}
                  onGoToCase={() => project && navigate(`/projects/${project.key}/cases/${item.caseKey}`)}
                  onAssign={() => setAssignTarget({ itemIds: [item.id] })}
                  onAssignSelected={handleAssignSelected}
                  onItemVerdict={(verdict) => void handleItemVerdict(item.id, verdict)}
                  onRetest={() => void handleRetest(item.id)}
                  bulkVerdictItems={verdictMenuItems}
                  canRecord={canRecord}
                  jiraSiteUrl={jiraSiteUrl}
                  onSaveJiraLink={handleSaveJiraLink}
                />
              ))}
            </ul>
          )}
          <LoadMoreButton hasMore={!!itemsCursor} loading={loadingMoreItems} onClick={() => void loadMoreItems()} label="Load more items" />
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

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete &quot;{run?.name}&quot;?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Permanently removes this run and its {summary?.total ?? 0} recorded result
            {summary?.total === 1 ? '' : 's'}. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDeleteRun()}>
              Delete run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
