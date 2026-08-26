import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FolderIcon, FileTextIcon, FolderInputIcon, Trash2Icon } from 'lucide-react'
import { api } from '@/lib/api'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { FolderTree, CASE_ID_MIME } from '@/components/FolderTree'
import { ResizeHandle } from '@/components/ResizeHandle'
import { useResizableWidth } from '@/lib/useResizableWidth'
import { FolderPicker } from '@/components/FolderPicker'
import { CaseDrawer, type ClassificationFields, type Step } from '@/components/CaseDrawer'
import { RowActionMenu, type RowActionMenuHandle, type RowActionMenuItem } from '@/components/RowActionMenu'
import { AutomationPill, ClassificationPills, distinctValues, FlakyPill, StalePill, tagPills } from '@/components/Pills'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { useProjectPermissions, useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import { timeAgo } from '@/lib/timeAgo'
import { isEditableElementFocused } from '@/lib/keyboardShortcutGuard'
import { RunShortcutsHint, RunShortcutsOverlay, type ShortcutEntry } from '@/components/RunShortcuts'
import { LibraryBulkActionBar } from '@/components/LibraryBulkActionBar'
import type { BulkAction } from '@/components/RunBulkActionBar'
import { bulkMoveCases } from '@/lib/bulkMoveCases'
import { bulkDeleteCases } from '@/lib/bulkDeleteCases'
import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']
type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']

type DeleteTarget =
  | { kind: 'case'; key: string; title: string }
  | { kind: 'folder'; id: string; name: string; caseCount: number; folderCount: number }
  | { kind: 'bulk'; keys: string[] }

type DrawerState = { mode: 'create' }

function ancestorChain(folders: Folder[], folderId: string): Folder[] {
  const chain: Folder[] = []
  let current = folders.find((f) => f.id === folderId)
  while (current && current.parentFolderId) {
    chain.unshift(current)
    current = folders.find((f) => f.id === current!.parentFolderId)
  }
  return chain
}

function folderPathLabel(folders: Folder[], folderId: string): string {
  return ancestorChain(folders, folderId)
    .map((f) => f.name)
    .join(' / ')
}

// The project's auto-created root folder is surfaced to users as "Library" —
// a UI label only, not a rename of the underlying entity (still literally
// named "Root" in the database).
function displayFolderName(folder: Folder | undefined, rootId: string): string {
  if (!folder) return ''
  return folder.id === rootId ? 'Library' : folder.name
}

const STALE_DAYS = 90

function isStale(updatedAt: string): boolean {
  const days = (Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000)
  return days >= STALE_DAYS
}

// Each row owns its own RowActionMenu ref so a right-click on the row can
// open that exact menu at the cursor, alongside its visible "⋯" trigger
// (unify-library-row-menus) — a ref can't live inside a bare .map()
// callback, hence these as real component instances, matching the
// precedent FolderTree.tsx's own TreeNode already sets.
function FolderRow({
  folder,
  stats,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onNavigate,
  canDelete,
  onRequestDelete,
}: {
  folder: Folder
  stats: { count: number; hasCritical: boolean; criticalCount: number; automatedCount: number }
  isDragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (caseKey: string) => void
  onNavigate: () => void
  canDelete: boolean
  onRequestDelete: () => void
}) {
  const menuRef = useRef<RowActionMenuHandle>(null)
  const items: RowActionMenuItem[] = [
    { label: 'Delete', danger: true, icon: <Trash2Icon className="size-4" aria-hidden="true" />, onSelect: onRequestDelete },
  ]

  return (
    <li
      className={`group flex items-center gap-2 border-b px-3 py-2 text-sm transition-[transform,box-shadow] duration-150 last:border-b-0 hover:-translate-y-px hover:shadow-md ${isDragOver ? 'bg-primary/10' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        onDragLeave()
        const caseKey = e.dataTransfer.getData(CASE_ID_MIME)
        if (caseKey) onDrop(caseKey)
      }}
      onContextMenu={(e) => {
        if (!canDelete) return
        e.preventDefault()
        menuRef.current?.openAt(e.clientX, e.clientY)
      }}
    >
      <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={onNavigate}>
        <FolderIcon className="size-4 text-primary" aria-hidden="true" />
        <span>{folder.name}</span>
      </button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {stats.hasCritical && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
            {stats.criticalCount} critical
          </span>
        )}
        {stats.count > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full bg-primary"
                style={{ width: `${Math.round((stats.automatedCount / stats.count) * 100)}%` }}
              />
            </span>
            {stats.automatedCount}/{stats.count} automated
          </span>
        ) : (
          <span>empty</span>
        )}
        <span>
          {stats.count} {stats.count === 1 ? 'case' : 'cases'}
        </span>
      </div>
      {canDelete && <RowActionMenu ref={menuRef} label={`Actions for ${folder.name}`} items={items} hoverReveal />}
    </li>
  )
}

function CaseRow({
  testCase,
  suiteNames,
  folderPath,
  isFlaky,
  onOpen,
  onDragStart,
  onMoveTo,
  canMove,
  canDelete,
  onRequestDelete,
  selected,
  onToggleSelect,
  focused,
  rowRef,
}: {
  testCase: TestCase
  suiteNames: string[]
  // Shown only in "Search entire Library" mode, where cases from many
  // folders are flattened into one list (design.md).
  folderPath?: string
  // Server-computed (add-flaky-test-detection) — the case's current
  // version has both a pass and a failed/blocked execution.
  isFlaky: boolean
  onOpen: () => void
  onDragStart: (e: DragEvent) => void
  onMoveTo: () => void
  canMove: boolean
  canDelete: boolean
  onRequestDelete: () => void
  // add-library-bulk-select: Shift+Click only (design.md D1) — a plain
  // click always opens the case via onOpen above.
  selected: boolean
  onToggleSelect: () => void
  // Keyboard focus (design.md D3/D4) — independent of selection, so the two
  // stay visually distinguishable when they overlap.
  focused: boolean
  rowRef: (el: HTMLLIElement | null) => void
}) {
  const menuRef = useRef<RowActionMenuHandle>(null)
  const items: RowActionMenuItem[] = [
    ...(canMove
      ? [
          {
            label: 'Move to…',
            icon: <FolderInputIcon className="size-4" aria-hidden="true" />,
            onSelect: onMoveTo,
          } satisfies RowActionMenuItem,
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: 'Delete',
            danger: true,
            dividerBefore: true,
            icon: <Trash2Icon className="size-4" aria-hidden="true" />,
            onSelect: onRequestDelete,
          } satisfies RowActionMenuItem,
        ]
      : []),
  ]

  return (
    <li
      ref={rowRef}
      draggable
      onDragStart={onDragStart}
      data-focused={focused ? 'true' : undefined}
      className={`group flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent ${selected ? 'bg-primary/10' : ''} ${focused ? 'ring-2 ring-inset ring-primary/50' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        menuRef.current?.openAt(e.clientX, e.clientY)
      }}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={(e) => {
          if (e.shiftKey) {
            e.preventDefault()
            onToggleSelect()
            return
          }
          onOpen()
        }}
      >
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{testCase.content.title}</span>
      </button>
      {folderPath && <span className="shrink-0 text-xs text-muted-foreground">{folderPath}</span>}
      {(testCase.content.platform || testCase.content.testType) && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {[testCase.content.platform, testCase.content.testType].filter(Boolean).join(' · ')}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-1.5 text-xs">
        <ClassificationPills priority={testCase.content.priority} />
        <AutomationPill automated={Boolean(testCase.content.automated)} />
        {isFlaky && <FlakyPill />}
        {tagPills(suiteNames)}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {isStale(testCase.updatedAt) ? <StalePill /> : timeAgo(testCase.updatedAt)}
      </span>
      {items.length > 0 && (
        <RowActionMenu ref={menuRef} label={`Actions for ${testCase.content.title}`} items={items} hoverReveal />
      )}
    </li>
  )
}

export default function FolderExplorerPage() {
  const { projectKey, folderId } = useParams<{ projectKey: string; folderId?: string }>()
  const navigate = useNavigate()
  const bumpLanding = useBumpDataRevision()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [cases, setCases] = useState<TestCase[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [flakyKeys, setFlakyKeys] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [movingCaseKey, setMovingCaseKey] = useState<string | null>(null)
  const [moveQuery, setMoveQuery] = useState('')
  const [bulkMoveKeys, setBulkMoveKeys] = useState<string[] | null>(null)
  const [bulkMoveQuery, setBulkMoveQuery] = useState('')
  const [browsingSections, setBrowsingSections] = useState(false)
  const [browseQuery, setBrowseQuery] = useState('')
  const [treeCreatingIn, setTreeCreatingIn] = useState<string | null>(null)
  const [contentCreatingFolder, setContentCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ tag: '', priority: '', platform: '', testType: '', automated: '', flaky: '' })
  const [searchEntireLibrary, setSearchEntireLibrary] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastToggledKey, setLastToggledKey] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const caseRowRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  const treeWidth = useResizableWidth({ storageKey: 'testpulse.libraryTreeWidth', defaultWidth: 256, min: 200, max: 480 })

  const permissions = useProjectPermissions(projectKey)
  const { user, loading: authLoading } = useAuth()
  const access = useProjectReadAccess(projectKey, user, authLoading)

  const load = useCallback(async () => {
    // Waits for the session check and confirmed project read access before
    // firing either branch (design.md D2/D11, unify-authenticated-and-public-views)
    // — a signed-in non-member resolves to 'public' here, reading a public
    // project like an anonymous visitor instead of hitting 403s.
    if (!projectKey || access === 'loading') return
    setNotFound(false)
    const [{ data: p }, { data: f }, { data: c }, { data: s }, { data: flaky }] = access === 'member'
      ? await Promise.all([
          api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
          api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey } } }),
          api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey } } }),
          api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey } } }),
          api.GET('/api/v1/projects/{projectKey}/flaky-cases', { params: { path: { projectKey } } }),
        ])
      : await Promise.all([
          api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }),
          api.GET('/api/v1/public/projects/{projectKey}/folders', { params: { path: { projectKey } } }),
          api.GET('/api/v1/public/projects/{projectKey}/cases', { params: { path: { projectKey } } }),
          api.GET('/api/v1/public/projects/{projectKey}/suites', { params: { path: { projectKey } } }),
          api.GET('/api/v1/public/projects/{projectKey}/flaky-cases', { params: { path: { projectKey } } }),
        ])
    if (!p) {
      setNotFound(true)
      return
    }
    setProject(p)
    setFolders(f ?? [])
    setCases(c ?? [])
    setSuites(s ?? [])
    setFlakyKeys(new Set((flaky ?? []).map((fc) => fc.caseKey)))
  }, [projectKey, access])

  useEffect(() => {
    void load()
  }, [load])

  const root = folders.find((f) => !f.parentFolderId)
  const selectedFolderId = folderId ?? root?.id
  const selectedFolder = folders.find((f) => f.id === selectedFolderId)

  useEffect(() => {
    if (!selectedFolderId) return
    const ancestors = ancestorChain(folders, selectedFolderId).map((f) => f.id)
    setExpanded((prev) => new Set([...prev, ...ancestors]))
  }, [selectedFolderId, folders])

  // Everything below, through the keyboard-nav effects, is computed above
  // the early-return guards (unlike most of this component's render-only
  // derivations) — these effects must run on every render, early-returns or
  // not, or the hook count changes between renders (a hooks-rule crash).
  const casesHere = cases.filter((c) => c.folderId === selectedFolderId)

  const normalizedSearch = search.trim().toLowerCase()

  function caseMatches(c: TestCase): boolean {
    if (normalizedSearch && !c.content.title.toLowerCase().includes(normalizedSearch)) return false
    if (filters.tag && !c.content.tags?.includes(filters.tag)) return false
    if (filters.priority && c.content.priority !== filters.priority) return false
    if (filters.platform && c.content.platform !== filters.platform) return false
    if (filters.testType && c.content.testType !== filters.testType) return false
    if (filters.automated === 'yes' && !c.content.automated) return false
    if (filters.automated === 'no' && c.content.automated) return false
    if (filters.flaky === 'yes' && !flakyKeys.has(c.key)) return false
    if (filters.flaky === 'no' && flakyKeys.has(c.key)) return false
    return true
  }

  const visibleHere = casesHere.filter(caseMatches)
  const entireLibraryMatches = cases.filter(caseMatches)
  const orderedVisibleCases = searchEntireLibrary ? entireLibraryMatches : visibleHere

  // Shift+Click-only range select (no checkboxes, add-library-bulk-select
  // design.md D1) — identical anchor/range semantics to RunPage.tsx's own
  // toggleSelect, applied here for the first time without an accompanying
  // checkbox: the first Shift+Click (no anchor yet) toggles just that row
  // and becomes the anchor; a later Shift+Click extends a contiguous range.
  function toggleSelect(caseKey: string, shiftKey: boolean) {
    if (shiftKey && lastToggledKey) {
      const keys = orderedVisibleCases.map((c) => c.key)
      const fromIndex = keys.indexOf(lastToggledKey)
      const toIndex = keys.indexOf(caseKey)
      if (fromIndex !== -1 && toIndex !== -1) {
        const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
        const rangeKeys = keys.slice(start, end + 1)
        setSelected((prev) => new Set([...prev, ...rangeKeys]))
        setLastToggledKey(caseKey)
        return
      }
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(caseKey)) next.delete(caseKey)
      else next.add(caseKey)
      return next
    })
    setLastToggledKey(caseKey)
  }

  // A stable (string, value-compared) signal of which cases are visible and
  // in what order — orderedVisibleCases itself is a fresh array every
  // render, so depending on it directly would fire these effects on every
  // render, not just when the actual visible set changes.
  const orderedVisibleKeysSignal = orderedVisibleCases.map((c) => c.key).join(',')

  useEffect(() => {
    setFocusedIndex(0)
  }, [orderedVisibleKeysSignal])

  useEffect(() => {
    const target = orderedVisibleCases[focusedIndex]
    if (!target) return
    caseRowRefs.current.get(target.key)?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, orderedVisibleKeysSignal])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableElementFocused()) return
      const key = e.key.toLowerCase()
      if (key === 'j' || key === 'arrowdown') {
        setFocusedIndex((i) => Math.min(i + 1, orderedVisibleCases.length - 1))
        return
      }
      if (key === 'k' || key === 'arrowup') {
        setFocusedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (key === ' ') {
        e.preventDefault()
        const target = orderedVisibleCases[focusedIndex]
        if (target) toggleSelect(target.key, e.shiftKey)
        return
      }
      if (e.key === 'Enter') {
        const target = orderedVisibleCases[focusedIndex]
        if (target) openCase(target.key)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedVisibleKeysSignal, focusedIndex])

  const librarySelectionShortcuts: ShortcutEntry[] = [
    { keys: 'J/K · ↑/↓', label: 'Move focus' },
    { keys: 'Space', label: 'Select focused case' },
    { keys: 'Shift+Space', label: 'Extend selection' },
    { keys: 'Enter', label: 'Open focused case' },
  ]

  if (!projectKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Project not found. <Link to="/" className="underline">Go to Projects</Link>
        {!user && !authLoading && (
          <>
            {' '}
            ·{' '}
            <Link to="/login" state={{ from: `/projects/${projectKey}/library` }} className="underline">
              Log in
            </Link>
          </>
        )}
      </p>
    )
  }
  if (!root || !selectedFolderId) return null

  const subfolders = folders.filter((f) => f.parentFolderId === selectedFolderId)

  // Direct-children counts only, no recursive rollup (design.md) — computed
  // once from data already fetched, shared by the tree and content-pane rows.
  const folderStats: Record<string, { count: number; hasCritical: boolean; criticalCount: number; automatedCount: number }> = {}
  for (const f of folders) {
    const direct = cases.filter((c) => c.folderId === f.id)
    const criticalCount = direct.filter((c) => c.content.priority === 'critical').length
    folderStats[f.id] = {
      count: direct.length,
      hasCritical: criticalCount > 0,
      criticalCount,
      automatedCount: direct.filter((c) => c.content.automated).length,
    }
  }

  const anyFilterActive = Boolean(
    normalizedSearch || filters.tag || filters.priority || filters.platform || filters.testType || filters.automated || filters.flaky,
  )

  function filterSelectClass(active: boolean): string {
    return `h-8 rounded-md border px-2 text-sm ${active ? 'border-primary/40 bg-primary/5' : 'border-input bg-background'}`
  }

  const tagOptions = distinctValues(cases.flatMap((c) => c.content.tags ?? []).map((t) => ({ t })), (x) => x.t)
  const platformOptions = distinctValues(cases, (c) => c.content.platform ?? '')
  const testTypeOptions = distinctValues(cases, (c) => c.content.testType ?? '')

  const bulkActions: BulkAction[] = [
    ...(permissions?.caseEdit
      ? ([
          {
            kind: 'button',
            label: 'Move to…',
            onSelect: () => {
              setBulkMoveQuery('')
              setBulkMoveKeys(Array.from(selected))
            },
          },
        ] satisfies BulkAction[])
      : []),
    ...(permissions?.caseDelete
      ? ([{ kind: 'button', label: 'Delete', onSelect: () => setDeleteTarget({ kind: 'bulk', keys: Array.from(selected) }) }] satisfies BulkAction[])
      : []),
  ]

  function clearFilters() {
    setSearch('')
    setFilters({ tag: '', priority: '', platform: '', testType: '', automated: '', flaky: '' })
  }

  function suiteNamesFor(caseId: string): string[] {
    return suites.filter((s) => s.caseIds.includes(caseId)).map((s) => s.name)
  }

  async function createFolder(parentId: string, name: string) {
    if (!projectKey || !name.trim()) return
    await api.POST('/api/v1/projects/{projectKey}/folders', {
      params: { path: { projectKey } },
      body: { name: name.trim(), parentFolderId: parentId },
    })
    await load()
    bumpLanding()
  }

  // Dropping onto the case's own current folder is a no-op — not an error,
  // just nothing to do (design.md, move-cases-between-folders).
  async function moveCase(caseKey: string, targetFolderId: string) {
    const current = cases.find((c) => c.key === caseKey)
    if (!current || current.folderId === targetFolderId) return
    await api.PUT('/api/v1/cases/{caseKey}/folder', {
      params: { path: { caseKey } },
      body: { folderId: targetFolderId },
    })
    await load()
    bumpLanding()
  }

  async function requestDeleteFolder(folder: Folder) {
    const { data: preview } = await api.GET('/api/v1/folders/{folderId}/delete-preview', {
      params: { path: { folderId: folder.id } },
    })
    setDeleteTarget({
      kind: 'folder',
      id: folder.id,
      name: folder.name,
      caseCount: preview?.caseCount ?? 0,
      folderCount: preview?.folderCount ?? 0,
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'case') {
      await api.DELETE('/api/v1/cases/{caseKey}', { params: { path: { caseKey: deleteTarget.key } } })
    } else if (deleteTarget.kind === 'bulk') {
      await bulkDeleteCases(deleteTarget.keys)
      setSelected(new Set())
      setLastToggledKey(null)
    } else {
      await api.DELETE('/api/v1/folders/{folderId}', { params: { path: { folderId: deleteTarget.id } } })
    }
    setDeleteTarget(null)
    await load()
    bumpLanding()
  }

  async function handleBulkMove(targetFolderId: string) {
    if (!bulkMoveKeys) return
    await bulkMoveCases(bulkMoveKeys, targetFolderId)
    setBulkMoveKeys(null)
    setSelected(new Set())
    setLastToggledKey(null)
    await load()
    bumpLanding()
  }

  function openCase(caseKey: string) {
    if (!projectKey) return
    navigate(`/projects/${projectKey}/cases/${caseKey}`)
  }

  async function createCase(input: { title: string; steps: Step[] } & ClassificationFields) {
    if (!projectKey || !selectedFolderId) return
    await api.POST('/api/v1/projects/{projectKey}/cases', {
      params: { path: { projectKey } },
      body: {
        title: input.title,
        folderId: selectedFolderId,
        steps: input.steps,
        priority: input.priority,
        tags: input.tags,
        platform: input.platform,
        testType: input.testType,
        automated: input.automated,
      },
    })
    setDrawer(null)
    await load()
    bumpLanding()
  }

  const folderAncestors = ancestorChain(folders, selectedFolderId)
  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb([
    { label: 'Projects', href: '/' },
    { label: project?.name ?? '', href: `/projects/${projectKey}` },
    // No href when Library would be the sole remaining segment (browsing
    // the root itself) — that's "current location," not a distinct
    // ancestor; see the matching comment in CaseDetailPage.tsx.
    { label: 'Library', href: folderAncestors.length > 0 ? `/projects/${projectKey}/library/${root.id}` : undefined },
    ...folderAncestors.map((f) => ({
      label: f.name,
      href: `/projects/${projectKey}/library/${f.id}`,
    })),
  ])

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex">
        {isDesktop && (
          <>
            <FolderTree
              folders={folders.map((f) => ({ id: f.id, name: f.name, parentFolderId: f.parentFolderId }))}
              rootId={root.id}
              selectedId={selectedFolderId}
              expanded={expanded}
              folderStats={folderStats}
              onSelect={(id) => navigate(`/projects/${projectKey}/library/${id}`)}
              onToggle={(id) =>
                setExpanded((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }
              onNewSubfolder={(parentId) => {
                setExpanded((prev) => new Set(prev).add(parentId))
                setTreeCreatingIn(parentId)
                setNewFolderName('')
              }}
              creatingIn={treeCreatingIn}
              newFolderValue={newFolderName}
              onNewFolderValueChange={setNewFolderName}
              onConfirmNewFolder={() => {
                if (treeCreatingIn) void createFolder(treeCreatingIn, newFolderName)
                setTreeCreatingIn(null)
              }}
              onCancelNewFolder={() => setTreeCreatingIn(null)}
              onDropCase={(caseKey, folderId) => void moveCase(caseKey, folderId)}
              canCreate={Boolean(permissions?.sectionCreate)}
              width={treeWidth.width}
            />
            <ResizeHandle
              width={treeWidth.width}
              min={200}
              max={480}
              onResize={treeWidth.setWidth}
              onKeyDown={treeWidth.onKeyDown}
            />
          </>
        )}

        <div className={`min-w-0 flex-1 space-y-3 ${isDesktop ? 'pl-3' : ''}`}>
          <div className="flex items-center justify-end gap-2">
            {!isDesktop && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                onClick={() => {
                  setBrowseQuery('')
                  setBrowsingSections(true)
                }}
              >
                Browse sections
              </Button>
            )}
            {permissions?.sectionCreate && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setContentCreatingFolder(true)
                  setNewFolderName('')
                }}
              >
                + New section
              </Button>
            )}
            {permissions?.caseCreate && (
              <Button type="button" onClick={() => setDrawer({ mode: 'create' })}>
                + New test case
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
            <input
              type="text"
              aria-label="Search test cases"
              placeholder="Search test case titles…"
              className="h-8 min-w-[180px] flex-1 rounded-md border border-input bg-background px-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Tag"
              className={filterSelectClass(Boolean(filters.tag))}
              value={filters.tag}
              onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}
            >
              <option value="">All tags</option>
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              aria-label="Priority"
              className={filterSelectClass(Boolean(filters.priority))}
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
            >
              <option value="">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              aria-label="Platform"
              className={filterSelectClass(Boolean(filters.platform))}
              value={filters.platform}
              onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}
            >
              <option value="">All platforms</option>
              {platformOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              aria-label="Test type"
              className={filterSelectClass(Boolean(filters.testType))}
              value={filters.testType}
              onChange={(e) => setFilters((f) => ({ ...f, testType: e.target.value }))}
            >
              <option value="">All test types</option>
              {testTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              aria-label="Automated"
              className={filterSelectClass(Boolean(filters.automated))}
              value={filters.automated}
              onChange={(e) => setFilters((f) => ({ ...f, automated: e.target.value }))}
            >
              <option value="">All automation</option>
              <option value="yes">Automated</option>
              <option value="no">Manual</option>
            </select>
            <select
              aria-label="Flaky"
              className={filterSelectClass(Boolean(filters.flaky))}
              value={filters.flaky}
              onChange={(e) => setFilters((f) => ({ ...f, flaky: e.target.value }))}
            >
              <option value="">All flakiness</option>
              <option value="yes">Flaky</option>
              <option value="no">Not flaky</option>
            </select>
            {anyFilterActive && (
              <button
                type="button"
                className="text-sm font-medium text-primary underline underline-offset-2"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
            <label className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={searchEntireLibrary}
                onChange={(e) => setSearchEntireLibrary(e.target.checked)}
              />
              Search entire Library
            </label>
          </div>

          <Card>
            <CardContent className="p-0">
              {contentCreatingFolder && (
                <div className="flex items-center gap-2 border-b bg-accent px-3 py-2">
                  <input
                    aria-label="New section name"
                    autoFocus
                    className="h-7 flex-1 rounded border px-2 text-sm"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void createFolder(selectedFolderId, newFolderName)
                        setContentCreatingFolder(false)
                      }
                      if (e.key === 'Escape') setContentCreatingFolder(false)
                    }}
                  />
                </div>
              )}
              {searchEntireLibrary ? (
                entireLibraryMatches.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    No cases match your search. Try a different term, or clear filters to see everything.
                  </p>
                ) : (
                  <ul aria-label="Section contents">
                    {entireLibraryMatches.map((c) => (
                      <CaseRow
                        key={c.id}
                        testCase={c}
                        suiteNames={suiteNamesFor(c.id)}
                        folderPath={folderPathLabel(folders, c.folderId)}
                        isFlaky={flakyKeys.has(c.key)}
                        onOpen={() => openCase(c.key)}
                        onDragStart={(e) => e.dataTransfer.setData(CASE_ID_MIME, c.key)}
                        onMoveTo={() => {
                          setMoveQuery('')
                          setMovingCaseKey(c.key)
                        }}
                        canMove={Boolean(permissions?.caseEdit)}
                        canDelete={Boolean(permissions?.caseDelete)}
                        onRequestDelete={() => setDeleteTarget({ kind: 'case', key: c.key, title: c.content.title })}
                        selected={selected.has(c.key)}
                        onToggleSelect={() => toggleSelect(c.key, true)}
                        focused={orderedVisibleCases[focusedIndex]?.key === c.key}
                        rowRef={(el) => {
                          if (el) caseRowRefs.current.set(c.key, el)
                          else caseRowRefs.current.delete(c.key)
                        }}
                      />
                    ))}
                  </ul>
                )
              ) : subfolders.length === 0 && casesHere.length === 0 && !contentCreatingFolder ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Nothing here yet in {displayFolderName(selectedFolder, root.id)}.
                </p>
              ) : subfolders.length === 0 && visibleHere.length === 0 && anyFilterActive ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No cases match your filters. Try a different combination, or use "Clear filters" above to see all
                  cases in {displayFolderName(selectedFolder, root.id)}.
                </p>
              ) : (
                <ul aria-label="Section contents">
                  {subfolders.map((f) => (
                    <FolderRow
                      key={f.id}
                      folder={f}
                      stats={folderStats[f.id]}
                      isDragOver={dragOverFolderId === f.id}
                      onDragOver={() => setDragOverFolderId(f.id)}
                      onDragLeave={() => setDragOverFolderId(null)}
                      onDrop={(caseKey) => void moveCase(caseKey, f.id)}
                      onNavigate={() => navigate(`/projects/${projectKey}/library/${f.id}`)}
                      canDelete={Boolean(permissions?.sectionDelete)}
                      onRequestDelete={() => void requestDeleteFolder(f)}
                    />
                  ))}
                  {visibleHere.map((c) => (
                    <CaseRow
                      key={c.id}
                      testCase={c}
                      suiteNames={suiteNamesFor(c.id)}
                      isFlaky={flakyKeys.has(c.key)}
                      onOpen={() => openCase(c.key)}
                      onDragStart={(e) => e.dataTransfer.setData(CASE_ID_MIME, c.key)}
                      onMoveTo={() => {
                        setMoveQuery('')
                        setMovingCaseKey(c.key)
                      }}
                      canMove={Boolean(permissions?.caseEdit)}
                      canDelete={Boolean(permissions?.caseDelete)}
                      onRequestDelete={() => setDeleteTarget({ kind: 'case', key: c.key, title: c.content.title })}
                      selected={selected.has(c.key)}
                      onToggleSelect={() => toggleSelect(c.key, true)}
                      focused={orderedVisibleCases[focusedIndex]?.key === c.key}
                      rowRef={(el) => {
                        if (el) caseRowRefs.current.set(c.key, el)
                        else caseRowRefs.current.delete(c.key)
                      }}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <RunShortcutsHint shortcuts={librarySelectionShortcuts} />
        </div>
      </div>

      <RunShortcutsOverlay shortcuts={librarySelectionShortcuts} />

      <LibraryBulkActionBar
        count={selected.size}
        total={orderedVisibleCases.length}
        onSelectAll={() => setSelected(new Set(orderedVisibleCases.map((c) => c.key)))}
        actions={bulkActions}
        onClear={() => {
          setSelected(new Set())
          setLastToggledKey(null)
        }}
      />

      <Dialog open={movingCaseKey !== null} onOpenChange={(open) => !open && setMovingCaseKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Move to…</DialogTitle>
          <FolderPicker
            folders={folders}
            rootId={root.id}
            query={moveQuery}
            onQueryChange={setMoveQuery}
            folderStats={folderStats}
            onSelect={(targetFolderId) => {
              if (movingCaseKey) void moveCase(movingCaseKey, targetFolderId)
              setMovingCaseKey(null)
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={bulkMoveKeys !== null} onOpenChange={(open) => !open && setBulkMoveKeys(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Move {bulkMoveKeys?.length} cases to…</DialogTitle>
          <FolderPicker
            folders={folders}
            rootId={root.id}
            query={bulkMoveQuery}
            onQueryChange={setBulkMoveQuery}
            folderStats={folderStats}
            onSelect={(targetFolderId) => void handleBulkMove(targetFolderId)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={browsingSections} onOpenChange={setBrowsingSections}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Browse sections</DialogTitle>
          <FolderPicker
            folders={folders}
            rootId={root.id}
            query={browseQuery}
            onQueryChange={setBrowseQuery}
            folderStats={folderStats}
            onSelect={(targetFolderId) => {
              navigate(`/projects/${projectKey}/library/${targetFolderId}`)
              setBrowsingSections(false)
            }}
          />
        </DialogContent>
      </Dialog>

      {drawer?.mode === 'create' && (
        <CaseDrawer
          mode="create"
          open
          folderName={displayFolderName(selectedFolder, root.id)}
          onClose={() => setDrawer(null)}
          onCreate={(input) => void createCase(input)}
        />
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {deleteTarget?.kind === 'case' && (
            <>
              <DialogTitle>Delete case?</DialogTitle>
              <DialogDescription>
                Delete case &ldquo;{deleteTarget.title}&rdquo;? This cannot be undone.
              </DialogDescription>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void confirmDelete()}>
                  Delete case
                </Button>
              </DialogFooter>
            </>
          )}
          {deleteTarget?.kind === 'bulk' && (
            <>
              <DialogTitle>Delete {deleteTarget.keys.length} cases?</DialogTitle>
              <DialogDescription>
                Delete {deleteTarget.keys.length} case{deleteTarget.keys.length === 1 ? '' : 's'}? This cannot be
                undone.
              </DialogDescription>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void confirmDelete()}>
                  Confirm delete
                </Button>
              </DialogFooter>
            </>
          )}
          {deleteTarget?.kind === 'folder' && (
            <>
              <DialogTitle>Delete section?</DialogTitle>
              <DialogDescription>
                Delete section &ldquo;{deleteTarget.name}&rdquo; and everything in it? This removes{' '}
                {deleteTarget.caseCount} case{deleteTarget.caseCount === 1 ? '' : 's'} and{' '}
                {deleteTarget.folderCount} subsection{deleteTarget.folderCount === 1 ? '' : 's'}. This cannot be
                undone.
              </DialogDescription>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void confirmDelete()}>
                  Delete section
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
