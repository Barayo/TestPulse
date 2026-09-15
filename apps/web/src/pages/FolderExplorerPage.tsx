import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import { FolderIcon, FileTextIcon, FolderInputIcon, Trash2Icon, UploadIcon, DownloadIcon } from 'lucide-react'
import { useFloatingPosition } from '@/lib/useFloatingPosition'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { buildSlugPath, resolveSlugPath } from '@/lib/folderSlugPath'
import { ConfirmBanner } from '@/components/ConfirmBanner'
import { FolderTree, CASE_ID_MIME } from '@/components/FolderTree'
import { ResizeHandle } from '@/components/ResizeHandle'
import { useResizableWidth } from '@/lib/useResizableWidth'
import { FolderPicker } from '@/components/FolderPicker'
import { RowActionMenu, type RowActionMenuHandle, type RowActionMenuItem } from '@/components/RowActionMenu'
import { AutomationPill, ClassificationPills, distinctValues, FlakyPill, StalePill, tagPills } from '@/components/Pills'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { bulkMoveFolders } from '@/lib/bulkMoveFolders'
import { bulkDeleteFolders } from '@/lib/bulkDeleteFolders'
import { folderDeletePreviewTotal } from '@/lib/folderDeletePreviewTotal'
import { subtreeIds } from '@/lib/subtreeIds'
import { resolveSuiteCaseKeys } from '@/lib/resolveSuiteCaseKeys'
import { createSuiteFromCases } from '@/lib/createSuiteFromCases'
import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']
type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']

type DeleteTarget =
  | { kind: 'case'; key: string; title: string }
  | { kind: 'folder'; id: string; name: string; caseCount: number; folderCount: number }
  // add-library-folder-selection: `keys`/`folderIds` split by kind for the
  // confirm step's two bulk-delete calls; `caseCount`/`folderCount` are the
  // precomputed sum (directly selected cases + every selected folder's own
  // subtree preview) shown by the confirmation dialog.
  | { kind: 'bulk'; keys: string[]; folderIds: string[]; caseCount: number; folderCount: number }

// add-library-folder-selection design.md D4: one combined, rendered-order
// list of folder and case rows backs Shift+Click ranging and keyboard nav —
// folder DB ids and case keys are confirmed disjoint namespaces, so a
// single `id` field is safe to share one Set<string> selection across both.
type Entry = { kind: 'folder'; id: string; folder: Folder } | { kind: 'case'; id: string; case: TestCase }

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
  canMove,
  onMoveTo,
  canDelete,
  onRequestDelete,
  selected,
  onToggleSelect,
  focused,
  rowRef,
  selectedCount,
  bulkMenuItems,
}: {
  folder: Folder
  stats: { count: number; hasCritical: boolean; criticalCount: number; automatedCount: number }
  isDragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (caseKey: string) => void
  onNavigate: () => void
  canMove: boolean
  onMoveTo: () => void
  canDelete: boolean
  onRequestDelete: () => void
  // add-library-folder-selection: matches CaseRow's selection props exactly
  // — Shift+Click only (no checkbox), independent keyboard focus ring.
  selected: boolean
  onToggleSelect: () => void
  focused: boolean
  rowRef: (el: HTMLLIElement | null) => void
  // add-suite-from-library-selection: total selection size and the
  // footer bar's own bulk items, so a right-click on a row that's part of a
  // real multi-selection (selectedCount > 1) can show them instead of this
  // row's single-item menu (mirrors RunPage's isBulkContext pattern).
  selectedCount: number
  bulkMenuItems: RowActionMenuItem[]
}) {
  const menuRef = useRef<RowActionMenuHandle>(null)
  const isBulkContext = selected && selectedCount > 1
  const items: RowActionMenuItem[] = isBulkContext
    ? bulkMenuItems
    : [
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
  const canOpenMenu = isBulkContext ? items.length > 0 : canMove || canDelete

  return (
    <li
      ref={rowRef}
      data-focused={focused ? 'true' : undefined}
      className={`group flex items-center gap-2 border-b px-3 py-2 text-sm transition-[transform,box-shadow] duration-150 last:border-b-0 hover:-translate-y-px hover:shadow-md ${isDragOver ? 'bg-primary/10' : selected ? 'bg-primary/10' : ''} ${focused ? 'ring-2 ring-inset ring-primary/50' : ''}`}
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
        if (!canOpenMenu) return
        e.preventDefault()
        menuRef.current?.openAt(e.clientX, e.clientY)
      }}
    >
      <button
        type="button"
        className="flex flex-1 items-center gap-2 text-left"
        // Shift+Click is also the browser's own "extend text selection"
        // gesture — by the time a click handler's preventDefault() runs,
        // native selection has already been finalized from mousedown, so
        // it has to be suppressed here instead.
        onMouseDown={(e) => {
          if (e.shiftKey) e.preventDefault()
        }}
        onClick={(e) => {
          if (e.shiftKey) {
            e.preventDefault()
            onToggleSelect()
            return
          }
          onNavigate()
        }}
      >
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
      {canOpenMenu && <RowActionMenu ref={menuRef} label={`Actions for ${folder.name}`} items={items} hoverReveal />}
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
  selectedCount,
  bulkMenuItems,
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
  // add-suite-from-library-selection: see FolderRow's identical props above.
  selectedCount: number
  bulkMenuItems: RowActionMenuItem[]
}) {
  const menuRef = useRef<RowActionMenuHandle>(null)
  const isBulkContext = selected && selectedCount > 1
  const items: RowActionMenuItem[] = isBulkContext
    ? bulkMenuItems
    : [
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
        // See FolderRow's identical onMouseDown above — Shift+Click's native
        // text-selection has to be suppressed before it happens, not after.
        onMouseDown={(e) => {
          if (e.shiftKey) e.preventDefault()
        }}
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
  // add-folder-slug-urls: the URL's trailing segment is a slug-path
  // (e.g. "authentication/two-factor"), resolved below against the
  // loaded folder tree — not a folder ID.
  const { projectKey, '*': slugPath } = useParams<{ projectKey: string; '*': string }>()
  const navigate = useNavigate()
  const bumpLanding = useBumpDataRevision()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [dataTruncated, setDataTruncated] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [justMoved, setJustMoved] = useState<{ name: string } | null>(null)
  const [createFolderError, setCreateFolderError] = useState<string | undefined>(undefined)
  const [cases, setCases] = useState<TestCase[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [flakyKeys, setFlakyKeys] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [movingCaseKey, setMovingCaseKey] = useState<string | null>(null)
  const [moveQuery, setMoveQuery] = useState('')
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null)
  const [moveFolderError, setMoveFolderError] = useState<string | undefined>(undefined)
  const [moveFolderQuery, setMoveFolderQuery] = useState('')
  const [bulkMoveKeys, setBulkMoveKeys] = useState<string[] | null>(null)
  const [bulkMoveQuery, setBulkMoveQuery] = useState('')
  const [browsingSections, setBrowsingSections] = useState(false)
  const [browseQuery, setBrowseQuery] = useState('')
  const [treeCreatingIn, setTreeCreatingIn] = useState<string | null>(null)
  const [contentCreatingFolder, setContentCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined)
  const [bulkMoveError, setBulkMoveError] = useState<string | undefined>(undefined)
  const [creatingSuiteFromSelection, setCreatingSuiteFromSelection] = useState(false)
  const [newSuiteFromSelectionName, setNewSuiteFromSelectionName] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ tag: '', priority: '', platform: '', testType: '', automated: '', flaky: '' })
  const [searchEntireLibrary, setSearchEntireLibrary] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastToggledId, setLastToggledId] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map())

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
    // Folders, cases, and suites are fetched as the complete set (not a
    // paginated display) — the sidebar tree, ancestor breadcrumbs, per-folder
    // stats rollup, and the three "Move to…" pickers all need every folder
    // to be structurally correct, and the cases endpoint isn't folder-scoped
    // server-side, so a partial page wouldn't reliably reflect what's shown
    // in the currently browsed folder anyway. Same reference-data class as
    // the picker/dropdown consumers fixed via fetchAllPages elsewhere.
    const [{ data: p }, f, c, s, { data: flaky }] = access === 'member'
      ? await Promise.all([
          api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
          fetchAllPages((cursor) =>
            api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
          ),
          fetchAllPages((cursor) =>
            api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
          ),
          fetchAllPages((cursor) =>
            api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
          ),
          api.GET('/api/v1/projects/{projectKey}/flaky-cases', { params: { path: { projectKey } } }),
        ])
      : await Promise.all([
          api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }),
          fetchAllPages((cursor) =>
            api.GET('/api/v1/public/projects/{projectKey}/folders', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
          ),
          fetchAllPages((cursor) =>
            api.GET('/api/v1/public/projects/{projectKey}/cases', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
          ),
          fetchAllPages((cursor) =>
            api.GET('/api/v1/public/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
          ),
          api.GET('/api/v1/public/projects/{projectKey}/flaky-cases', { params: { path: { projectKey } } }),
        ])
    if (!p) {
      setNotFound(true)
      return
    }
    setProject(p)
    setFolders(f.items)
    setCases(c.items)
    setSuites(s.items)
    // Every downstream computation here (tree, stats, pickers) assumes a
    // complete set — fetchAllPages caps its drain (security review,
    // add-cursor-pagination task 12.1d), so a project past that ceiling
    // gets a visible warning instead of silently wrong counts/navigation.
    setDataTruncated(f.truncated || c.truncated || s.truncated)
    setFlakyKeys(new Set((flaky ?? []).map((fc) => fc.caseKey)))
  }, [projectKey, access])

  useEffect(() => {
    void load()
  }, [load])

  const root = folders.find((f) => !f.parentFolderId)
  const slugSegments = slugPath ? slugPath.split('/') : []
  const resolution = root ? resolveSlugPath(slugSegments, folders, root.id) : null
  const folderNotFound = Boolean(root) && folders.length > 0 && !resolution
  const selectedFolderId = resolution?.folder.id
  const selectedFolder = folders.find((f) => f.id === selectedFolderId)

  // CSV import/export toolbar (add-csv-import-export, Pepe mock): Import
  // opens a Dialog scoped to the folder already on screen — no target
  // picker, since the folder is implied by where the user is standing.
  // Export opens a small anchored menu (the same useFloatingPosition
  // idiom ProjectsPage.tsx's NewProjectMenu already establishes) naming
  // the current folder and the whole project as two distinct choices, so
  // a mis-click can never silently balloon into a full-project download.
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importSubmitting, setImportSubmitting] = useState(false)
  const [importError, setImportError] = useState<string>()
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportContainerRef = useRef<HTMLDivElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const exportMenuPosition = useFloatingPosition(exportMenuOpen, exportContainerRef, 'right')

  useEffect(() => {
    if (!exportMenuOpen) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (exportContainerRef.current?.contains(target) || exportMenuRef.current?.contains(target)) return
      setExportMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExportMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [exportMenuOpen])

  async function handleImportSubmit(e: FormEvent) {
    e.preventDefault()
    if (!importFile || !selectedFolderId || !projectKey) return
    setImportError(undefined)
    setImportSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('folderId', selectedFolderId)
      const res = await fetch(`/api/v1/projects/${projectKey}/cases/import-csv`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const body = await res.json()
      if (!res.ok) {
        setImportError(body?.error ?? 'Could not import this CSV file.')
        return
      }
      setImportDialogOpen(false)
      setImportFile(null)
      bumpLanding()
      void load()
    } finally {
      setImportSubmitting(false)
    }
  }

  function triggerExport(folderId?: string) {
    setExportMenuOpen(false)
    if (!projectKey) return
    const url = folderId
      ? `/api/v1/projects/${projectKey}/cases/export-csv?folderId=${folderId}`
      : `/api/v1/projects/${projectKey}/cases/export-csv`
    window.location.href = url
  }

  function libraryUrl(folder: Folder): string {
    const path = buildSlugPath(folder, folders)
    return `/projects/${projectKey}/library${path ? `/${path}` : ''}`
  }

  useEffect(() => {
    if (!selectedFolderId) return
    const ancestors = ancestorChain(folders, selectedFolderId).map((f) => f.id)
    setExpanded((prev) => new Set([...prev, ...ancestors]))
  }, [selectedFolderId, folders])

  // A fresh delete/bulk-move target clears any stale error from a previous
  // attempt on a different target; a failed confirmDelete/handleBulkMove
  // doesn't change deleteTarget/bulkMoveKeys itself, so this doesn't wipe
  // the error it just set (Paco's QA pass on add-folder-slug-urls).
  useEffect(() => {
    if (deleteTarget) setDeleteError(undefined)
  }, [deleteTarget])

  useEffect(() => {
    if (bulkMoveKeys) setBulkMoveError(undefined)
  }, [bulkMoveKeys])

  // A slug-path that only resolved via a folder's previous identity (it
  // was moved since the URL was bookmarked) redirects the address bar to
  // the folder's current URL — via `replace` so the stale URL isn't left
  // in browser history — and shows a one-shot confirmation banner. Firing
  // only on resolution?.redirected transitioning to true (not on every
  // render) means the banner doesn't reappear on a subsequent reload: by
  // then the URL bar already holds the resolved, live-matching path, so
  // resolution.redirected is false.
  useEffect(() => {
    if (!resolution?.redirected || !projectKey) return
    navigate(libraryUrl(resolution.folder), { replace: true })
    setJustMoved({ name: resolution.folder.name })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution?.redirected, resolution?.folder.id, projectKey])

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
  // "Search entire Library" flattens to a cases-only list (no folder rows
  // are ever shown there); browsing a single section shows its subfolders
  // before its cases, matching the JSX render order below (design.md D4).
  const subfoldersHere = folders.filter((f) => f.parentFolderId === selectedFolderId)
  const orderedVisibleEntries: Entry[] = searchEntireLibrary
    ? entireLibraryMatches.map((c) => ({ kind: 'case', id: c.key, case: c }) satisfies Entry)
    : [
        ...subfoldersHere.map((f) => ({ kind: 'folder', id: f.id, folder: f }) satisfies Entry),
        ...visibleHere.map((c) => ({ kind: 'case', id: c.key, case: c }) satisfies Entry),
      ]

  // Shift+Click-only range select (no checkboxes, add-library-bulk-select
  // design.md D1) — identical anchor/range semantics to RunPage.tsx's own
  // toggleSelect, applied here for the first time without an accompanying
  // checkbox: the first Shift+Click (no anchor yet) toggles just that row
  // and becomes the anchor; a later Shift+Click extends a contiguous range.
  // add-library-folder-selection extends this to folder rows too — a range
  // can span both kinds, since both live in one ordered entry list.
  function toggleSelect(id: string, shiftKey: boolean) {
    if (shiftKey && lastToggledId) {
      const ids = orderedVisibleEntries.map((e) => e.id)
      const fromIndex = ids.indexOf(lastToggledId)
      const toIndex = ids.indexOf(id)
      if (fromIndex !== -1 && toIndex !== -1) {
        const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
        const rangeIds = ids.slice(start, end + 1)
        setSelected((prev) => new Set([...prev, ...rangeIds]))
        setLastToggledId(id)
        return
      }
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setLastToggledId(id)
  }

  // A stable (string, value-compared) signal of which entries are visible
  // and in what order — orderedVisibleEntries itself is a fresh array every
  // render, so depending on it directly would fire these effects on every
  // render, not just when the actual visible set changes.
  const orderedVisibleEntriesSignal = orderedVisibleEntries.map((e) => e.id).join(',')

  useEffect(() => {
    setFocusedIndex(0)
  }, [orderedVisibleEntriesSignal])

  useEffect(() => {
    const target = orderedVisibleEntries[focusedIndex]
    if (!target) return
    rowRefs.current.get(target.id)?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, orderedVisibleEntriesSignal])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableElementFocused()) return
      const key = e.key.toLowerCase()
      if (key === 'j' || key === 'arrowdown') {
        setFocusedIndex((i) => Math.min(i + 1, orderedVisibleEntries.length - 1))
        return
      }
      if (key === 'k' || key === 'arrowup') {
        setFocusedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (key === ' ') {
        e.preventDefault()
        const target = orderedVisibleEntries[focusedIndex]
        if (target) toggleSelect(target.id, e.shiftKey)
        return
      }
      if (e.key === 'Enter') {
        const target = orderedVisibleEntries[focusedIndex]
        if (!target) return
        if (target.kind === 'case') openCase(target.id)
        else navigate(libraryUrl(target.folder))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedVisibleEntriesSignal, focusedIndex])

  const librarySelectionShortcuts: ShortcutEntry[] = [
    { keys: 'J/K · ↑/↓', label: 'Move focus' },
    { keys: 'Space', label: 'Select focused row' },
    { keys: 'Shift+Space', label: 'Extend selection' },
    { keys: 'Enter', label: 'Open case / navigate into folder' },
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
  // Distinct from the "project not found" state above: the project loaded
  // fine, but this slug-path doesn't resolve against its folder tree
  // (neither a live match nor a previous-identity redirect) — e.g. a
  // malformed URL, or a bookmark that's survived more than one move.
  if (folderNotFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Section not found. <Link to={`/projects/${projectKey}/library`} className="underline">Go to Library</Link>
      </p>
    )
  }
  if (!root || !selectedFolderId) return null

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

  const { folderIds: selectedFolderIds, caseKeys: selectedCaseKeys } = splitSelection(Array.from(selected))
  const resolvedSuiteCaseKeys = resolveSuiteCaseKeys(selectedFolderIds, selectedCaseKeys, folders, cases)

  const canBulkMove = Boolean(permissions?.caseEdit || permissions?.sectionEdit)
  // add-suite-from-library-selection design.md D2/D7: hidden (not disabled)
  // once the resolved count is 0 — a folder-only selection is no longer a
  // reason to hide it, since a selected folder recursively contributes
  // every case in its subtree.
  const canBulkCreateSuite = Boolean(permissions?.suiteCreate) && resolvedSuiteCaseKeys.length > 0
  const canBulkDelete = Boolean(permissions?.caseDelete || permissions?.sectionDelete)
  const bulkCreateSuiteLabel = `Create suite from ${resolvedSuiteCaseKeys.length} case${resolvedSuiteCaseKeys.length === 1 ? '' : 's'}…`

  function openBulkMove() {
    setBulkMoveQuery('')
    setBulkMoveKeys(Array.from(selected))
  }

  function openCreateSuiteFromSelection() {
    setNewSuiteFromSelectionName('')
    setCreatingSuiteFromSelection(true)
  }

  const bulkActions: BulkAction[] = [
    ...(canBulkMove ? ([{ kind: 'button', label: 'Move to…', onSelect: openBulkMove }] satisfies BulkAction[]) : []),
    ...(canBulkCreateSuite
      ? ([{ kind: 'button', label: bulkCreateSuiteLabel, onSelect: openCreateSuiteFromSelection }] satisfies BulkAction[])
      : []),
    ...(canBulkDelete
      ? ([{ kind: 'button', label: 'Delete', onSelect: () => void requestBulkDelete(Array.from(selected)) }] satisfies BulkAction[])
      : []),
  ]

  // Right-clicking a row that's part of a real multi-selection shows these
  // instead of that row's own single-item menu (mirrors RunPage's existing
  // isBulkContext pattern, add-run-row-status-actions) — same handlers as
  // the footer bar's bulkActions above, just rendered as menu items.
  const bulkMenuItems: RowActionMenuItem[] = [
    ...(canBulkMove
      ? ([{ label: 'Move to…', icon: <FolderInputIcon className="size-4" aria-hidden="true" />, onSelect: openBulkMove }] satisfies RowActionMenuItem[])
      : []),
    ...(canBulkCreateSuite
      ? ([{ label: bulkCreateSuiteLabel, onSelect: openCreateSuiteFromSelection }] satisfies RowActionMenuItem[])
      : []),
    ...(canBulkDelete
      ? ([
          {
            label: 'Delete',
            danger: true,
            dividerBefore: true,
            icon: <Trash2Icon className="size-4" aria-hidden="true" />,
            onSelect: () => void requestBulkDelete(Array.from(selected)),
          },
        ] satisfies RowActionMenuItem[])
      : []),
  ]

  function clearFilters() {
    setSearch('')
    setFilters({ tag: '', priority: '', platform: '', testType: '', automated: '', flaky: '' })
  }

  function suiteNamesFor(caseId: string): string[] {
    return suites.filter((s) => s.caseIds.includes(caseId)).map((s) => s.name)
  }

  // Returns an error message on failure (e.g. a sibling-name collision,
  // add-folder-slug-urls) so the caller can keep its input row open with
  // the typed text intact instead of silently closing — this previously
  // never checked response.ok at all, so any failure just made the create
  // row vanish with no feedback.
  async function createFolder(parentId: string, name: string): Promise<string | undefined> {
    if (!projectKey || !name.trim()) return undefined
    const { error, response } = await api.POST('/api/v1/projects/{projectKey}/folders', {
      params: { path: { projectKey } },
      body: { name: name.trim(), parentFolderId: parentId },
    })
    if (!response.ok) {
      return (error as { error?: string })?.error ?? 'Could not create this section.'
    }
    await load()
    bumpLanding()
    return undefined
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

  // Returns an error message on failure (add-folder-slug-urls: a move can
  // now be rejected for a sibling-slug collision or a still-reserved slug
  // at the destination, not just the pre-existing cross-project/cycle
  // checks) so the caller can surface it instead of silently closing the
  // picker as if the move had happened.
  async function moveFolder(folderIdToMove: string, targetParentId: string): Promise<string | undefined> {
    const { error, response } = await api.PUT('/api/v1/folders/{folderId}', {
      params: { path: { folderId: folderIdToMove } },
      body: { parentFolderId: targetParentId },
    })
    if (!response.ok) {
      return (error as { error?: string })?.error ?? 'Could not move this section.'
    }
    await load()
    bumpLanding()
    return undefined
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

  // A mixed selection's ids are either folder DB ids or case keys (confirmed
  // disjoint namespaces, add-library-folder-selection design.md D4) — split
  // by checking membership against the currently-loaded folders list.
  function splitSelection(ids: string[]): { folderIds: string[]; caseKeys: string[] } {
    const folderIdSet = new Set(folders.map((f) => f.id))
    return {
      folderIds: ids.filter((id) => folderIdSet.has(id)),
      caseKeys: ids.filter((id) => !folderIdSet.has(id)),
    }
  }

  async function requestBulkDelete(ids: string[]) {
    const { folderIds, caseKeys } = splitSelection(ids)
    const folderTotal = folderIds.length > 0 ? await folderDeletePreviewTotal(folderIds) : { caseCount: 0, folderCount: 0 }
    setDeleteTarget({
      kind: 'bulk',
      keys: caseKeys,
      folderIds,
      caseCount: caseKeys.length + folderTotal.caseCount,
      folderCount: folderTotal.folderCount,
    })
  }

  // Returns an error message on failure, same discipline as moveFolder above
  // (Paco's QA pass on add-folder-slug-urls, 2026-09-10: this used to
  // discard the API response entirely and close the dialog/reload as if the
  // delete had succeeded).
  async function confirmDelete(): Promise<string | undefined> {
    if (!deleteTarget) return undefined
    if (deleteTarget.kind === 'case') {
      const { error, response } = await api.DELETE('/api/v1/cases/{caseKey}', { params: { path: { caseKey: deleteTarget.key } } })
      if (!response.ok) return (error as { error?: string })?.error ?? 'Could not delete this case.'
    } else if (deleteTarget.kind === 'bulk') {
      const [casesError, foldersError] = await Promise.all([
        bulkDeleteCases(deleteTarget.keys),
        bulkDeleteFolders(deleteTarget.folderIds),
      ])
      const error = [casesError, foldersError].filter(Boolean).join(' ')
      if (error) return error
      setSelected(new Set())
      setLastToggledId(null)
    } else {
      const { error, response } = await api.DELETE('/api/v1/folders/{folderId}', { params: { path: { folderId: deleteTarget.id } } })
      if (!response.ok) return (error as { error?: string })?.error ?? 'Could not delete this section.'
    }
    setDeleteTarget(null)
    await load()
    bumpLanding()
    return undefined
  }

  // Same error-surfacing discipline as confirmDelete above (Paco's QA pass).
  async function handleBulkMove(targetFolderId: string): Promise<string | undefined> {
    if (!bulkMoveKeys) return undefined
    const { folderIds, caseKeys } = splitSelection(bulkMoveKeys)
    const [casesError, foldersError] = await Promise.all([
      bulkMoveCases(caseKeys, targetFolderId),
      bulkMoveFolders(folderIds, targetFolderId),
    ])
    const error = [casesError, foldersError].filter(Boolean).join(' ')
    if (error) return error
    setBulkMoveKeys(null)
    setSelected(new Set())
    setLastToggledId(null)
    await load()
    bumpLanding()
    return undefined
  }

  function handleConfirmDelete() {
    void confirmDelete().then((error) => setDeleteError(error))
  }

  function handleSelectBulkMoveTarget(targetFolderId: string) {
    void handleBulkMove(targetFolderId).then((error) => setBulkMoveError(error))
  }

  function openCase(caseKey: string) {
    if (!projectKey) return
    navigate(`/projects/${projectKey}/cases/${caseKey}`)
  }

  // add-suite-from-library-selection design.md D1/D6: commits immediately
  // (no intermediate confirmation step), clears the Library selection, and
  // navigates straight to the new suite's own page — mirroring SuitesPage's
  // existing "+ New suite" flow.
  async function handleCreateSuiteFromSelection() {
    if (!projectKey || !newSuiteFromSelectionName.trim()) return
    const suite = await createSuiteFromCases(projectKey, newSuiteFromSelectionName.trim(), resolvedSuiteCaseKeys)
    setCreatingSuiteFromSelection(false)
    setSelected(new Set())
    setLastToggledId(null)
    bumpLanding()
    navigate(`/projects/${projectKey}/suites/${suite.key}`)
  }

  const folderAncestors = ancestorChain(folders, selectedFolderId)
  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb([
    { label: 'Projects', href: '/' },
    { label: project?.name ?? '', href: `/projects/${projectKey}` },
    // No href when Library would be the sole remaining segment (browsing
    // the root itself) — that's "current location," not a distinct
    // ancestor; see the matching comment in CaseDetailPage.tsx.
    { label: 'Library', href: folderAncestors.length > 0 ? libraryUrl(root) : undefined },
    ...folderAncestors.map((f) => ({
      label: f.name,
      href: libraryUrl(f),
    })),
  ])

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      {justMoved && (
        <ConfirmBanner
          message={`Section "${justMoved.name}" moved — showing its current location.`}
          onDismiss={() => setJustMoved(null)}
        />
      )}

      {dataTruncated && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          This project has more sections, cases, or suites than can be shown at once — some counts and search
          results below may be incomplete.
        </p>
      )}

      <div className="flex">
        {isDesktop && (
          <>
            <FolderTree
              folders={folders.map((f) => ({ id: f.id, name: f.name, parentFolderId: f.parentFolderId }))}
              rootId={root.id}
              selectedId={selectedFolderId}
              expanded={expanded}
              folderStats={folderStats}
              onSelect={(id) => {
                const target = folders.find((f) => f.id === id)
                if (target) navigate(libraryUrl(target))
              }}
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
                setCreateFolderError(undefined)
              }}
              creatingIn={treeCreatingIn}
              newFolderValue={newFolderName}
              onNewFolderValueChange={(v) => {
                setNewFolderName(v)
                setCreateFolderError(undefined)
              }}
              onConfirmNewFolder={() => {
                if (!treeCreatingIn) return
                void createFolder(treeCreatingIn, newFolderName).then((error) => {
                  if (error) {
                    setCreateFolderError(error)
                    return
                  }
                  setTreeCreatingIn(null)
                })
              }}
              onCancelNewFolder={() => {
                setTreeCreatingIn(null)
                setCreateFolderError(undefined)
              }}
              newFolderError={createFolderError}
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
                  setCreateFolderError(undefined)
                }}
              >
                + New section
              </Button>
            )}
            {permissions?.caseCreate && (
              <Button type="button" asChild>
                <Link to={`/projects/${projectKey}/cases/new?folderId=${selectedFolderId}`}>+ New test case</Link>
              </Button>
            )}
            {/* Desktop only for now — a 375px toolbar has no room left
                alongside "Browse sections" (mobile's own critical nav
                affordance) even with icon-only buttons; a real mobile
                treatment (e.g. folded into a menu) is a stated follow-up,
                not designed here. */}
            {isDesktop && permissions?.caseCreate && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Import"
                aria-label="Import"
                onClick={() => {
                  setImportFile(null)
                  setImportError(undefined)
                  setImportDialogOpen(true)
                }}
              >
                <UploadIcon className="size-4" aria-hidden="true" />
              </Button>
            )}
            {isDesktop && (
              <div ref={exportContainerRef} className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Export"
                  aria-label="Export"
                  aria-haspopup="menu"
                  aria-expanded={exportMenuOpen}
                  onClick={() => setExportMenuOpen((o) => !o)}
                >
                  <DownloadIcon className="size-4" aria-hidden="true" />
                </Button>
              {exportMenuOpen &&
                exportMenuPosition &&
                createPortal(
                  <div
                    ref={exportMenuRef}
                    role="menu"
                    aria-label="Export cases as CSV"
                    style={{ top: exportMenuPosition.top, right: exportMenuPosition.right }}
                    className="fixed z-50 w-64 rounded-md border bg-card p-1.5 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full rounded-md p-2.5 text-left text-sm hover:bg-accent"
                      onClick={() => triggerExport(selectedFolderId)}
                    >
                      Export {displayFolderName(selectedFolder, root?.id ?? '')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full rounded-md p-2.5 text-left text-sm hover:bg-accent"
                      onClick={() => triggerExport()}
                    >
                      Export entire project
                    </button>
                  </div>,
                  document.body,
                )}
              </div>
            )}
          </div>

          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogTitle>Import cases from CSV</DialogTitle>
              <DialogDescription>
                Importing into {displayFolderName(selectedFolder, root?.id ?? '')}. Any column that isn&apos;t a
                fixed field becomes a new custom field on this project.
              </DialogDescription>
              <form onSubmit={(e) => void handleImportSubmit(e)} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="library-import-file">CSV file</Label>
                  <Input
                    id="library-import-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                {importError && <p className="text-sm text-destructive">{importError}</p>}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!importFile || importSubmitting}>
                    {importSubmitting ? 'Importing…' : 'Import cases'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

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
                <div className="border-b bg-accent px-3 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="New section name"
                      autoFocus
                      className="h-7 flex-1 rounded border px-2 text-sm"
                      value={newFolderName}
                      onChange={(e) => {
                        setNewFolderName(e.target.value)
                        setCreateFolderError(undefined)
                      }}
                      onKeyDown={(e) => {
                        // Stops this keydown from ever reaching the page's
                        // global keyboard-shortcut listener on `window` — by
                        // the time that listener would run, this input may
                        // already be unmounting (Enter here also closes it),
                        // so `document.activeElement` can no longer be relied
                        // on to signal "an editable element handled this."
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          void createFolder(selectedFolderId, newFolderName).then((error) => {
                            if (error) {
                              setCreateFolderError(error)
                              return
                            }
                            setContentCreatingFolder(false)
                          })
                        }
                        if (e.key === 'Escape') {
                          setContentCreatingFolder(false)
                          setCreateFolderError(undefined)
                        }
                      }}
                    />
                  </div>
                  {createFolderError && (
                    <p role="alert" className="mt-1 text-sm text-destructive">
                      {createFolderError}
                    </p>
                  )}
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
                        focused={orderedVisibleEntries[focusedIndex]?.id === c.key}
                        selectedCount={selected.size}
                        bulkMenuItems={bulkMenuItems}
                        rowRef={(el) => {
                          if (el) rowRefs.current.set(c.key, el)
                          else rowRefs.current.delete(c.key)
                        }}
                      />
                    ))}
                  </ul>
                )
              ) : subfoldersHere.length === 0 && casesHere.length === 0 && !contentCreatingFolder ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Nothing here yet in {displayFolderName(selectedFolder, root.id)}.
                </p>
              ) : subfoldersHere.length === 0 && visibleHere.length === 0 && anyFilterActive ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No cases match your filters. Try a different combination, or use "Clear filters" above to see all
                  cases in {displayFolderName(selectedFolder, root.id)}.
                </p>
              ) : (
                <ul aria-label="Section contents">
                  {subfoldersHere.map((f) => (
                    <FolderRow
                      key={f.id}
                      folder={f}
                      stats={folderStats[f.id]}
                      isDragOver={dragOverFolderId === f.id}
                      onDragOver={() => setDragOverFolderId(f.id)}
                      onDragLeave={() => setDragOverFolderId(null)}
                      onDrop={(caseKey) => void moveCase(caseKey, f.id)}
                      onNavigate={() => navigate(libraryUrl(f))}
                      canMove={Boolean(permissions?.sectionEdit)}
                      onMoveTo={() => {
                        setMoveFolderQuery('')
                        setMovingFolderId(f.id)
                      }}
                      canDelete={Boolean(permissions?.sectionDelete)}
                      onRequestDelete={() => void requestDeleteFolder(f)}
                      selected={selected.has(f.id)}
                      onToggleSelect={() => toggleSelect(f.id, true)}
                      focused={orderedVisibleEntries[focusedIndex]?.id === f.id}
                      selectedCount={selected.size}
                      bulkMenuItems={bulkMenuItems}
                      rowRef={(el) => {
                        if (el) rowRefs.current.set(f.id, el)
                        else rowRefs.current.delete(f.id)
                      }}
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
                      focused={orderedVisibleEntries[focusedIndex]?.id === c.key}
                      selectedCount={selected.size}
                      bulkMenuItems={bulkMenuItems}
                      rowRef={(el) => {
                        if (el) rowRefs.current.set(c.key, el)
                        else rowRefs.current.delete(c.key)
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
        total={orderedVisibleEntries.length}
        onSelectAll={() => setSelected(new Set(orderedVisibleEntries.map((e) => e.id)))}
        actions={bulkActions}
        onClear={() => {
          setSelected(new Set())
          setLastToggledId(null)
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

      <Dialog
        open={movingFolderId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMovingFolderId(null)
            setMoveFolderError(undefined)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Move to…</DialogTitle>
          <FolderPicker
            folders={movingFolderId ? folders.filter((f) => !subtreeIds(folders, movingFolderId).has(f.id)) : folders}
            rootId={root.id}
            query={moveFolderQuery}
            onQueryChange={setMoveFolderQuery}
            folderStats={folderStats}
            onSelect={(targetFolderId) => {
              if (!movingFolderId) return
              void moveFolder(movingFolderId, targetFolderId).then((error) => {
                if (error) {
                  setMoveFolderError(error)
                  return
                }
                setMovingFolderId(null)
                setMoveFolderError(undefined)
              })
            }}
          />
          {moveFolderError && (
            <p role="alert" className="text-sm text-destructive">
              {moveFolderError}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={bulkMoveKeys !== null} onOpenChange={(open) => !open && setBulkMoveKeys(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Move {bulkMoveKeys?.length} {bulkMoveKeys?.length === 1 ? 'item' : 'items'} to…</DialogTitle>
          <FolderPicker
            folders={
              bulkMoveKeys
                ? folders.filter((f) => {
                    const excluded = splitSelection(bulkMoveKeys).folderIds.flatMap((id) => [...subtreeIds(folders, id)])
                    return !excluded.includes(f.id)
                  })
                : folders
            }
            rootId={root.id}
            query={bulkMoveQuery}
            onQueryChange={setBulkMoveQuery}
            folderStats={folderStats}
            onSelect={handleSelectBulkMoveTarget}
          />
          {bulkMoveError && (
            <p role="alert" className="text-sm text-destructive">
              {bulkMoveError}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creatingSuiteFromSelection} onOpenChange={setCreatingSuiteFromSelection}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>New suite from selection</DialogTitle>
          <DialogDescription>
            {resolvedSuiteCaseKeys.length} case{resolvedSuiteCaseKeys.length === 1 ? '' : 's'} from your selection
            will become this suite&apos;s members.
          </DialogDescription>
          <div className="space-y-1">
            <Label htmlFor="new-suite-from-selection-name">Suite name</Label>
            <Input
              id="new-suite-from-selection-name"
              autoFocus
              value={newSuiteFromSelectionName}
              onChange={(e) => setNewSuiteFromSelectionName(e.target.value)}
              placeholder="Smoke"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSuiteFromSelectionName.trim()) void handleCreateSuiteFromSelection()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingSuiteFromSelection(false)}>
              Cancel
            </Button>
            <Button disabled={!newSuiteFromSelectionName.trim()} onClick={() => void handleCreateSuiteFromSelection()}>
              Create suite
            </Button>
          </DialogFooter>
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
              const target = folders.find((f) => f.id === targetFolderId)
              if (target) navigate(libraryUrl(target))
              setBrowsingSections(false)
            }}
          />
        </DialogContent>
      </Dialog>


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
                <Button variant="destructive" onClick={handleConfirmDelete}>
                  Delete case
                </Button>
              </DialogFooter>
            </>
          )}
          {deleteTarget?.kind === 'bulk' && (
            <>
              <DialogTitle>
                Delete {deleteTarget.caseCount} case{deleteTarget.caseCount === 1 ? '' : 's'}
                {deleteTarget.folderCount > 0
                  ? ` and ${deleteTarget.folderCount} subsection${deleteTarget.folderCount === 1 ? '' : 's'}`
                  : ''}
                ?
              </DialogTitle>
              <DialogDescription>
                Delete {deleteTarget.caseCount} case{deleteTarget.caseCount === 1 ? '' : 's'}
                {deleteTarget.folderCount > 0
                  ? ` and ${deleteTarget.folderCount} subsection${deleteTarget.folderCount === 1 ? '' : 's'}`
                  : ''}
                ? This cannot be undone.
              </DialogDescription>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleConfirmDelete}>
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
                <Button variant="destructive" onClick={handleConfirmDelete}>
                  Delete section
                </Button>
              </DialogFooter>
            </>
          )}
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
