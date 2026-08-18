import { useMemo, useRef, useState } from 'react'
import { PRIORITIES, type Priority } from '@/components/ClassificationEditor'
import { ClassificationPills, distinctValues, tagPills } from '@/components/Pills'
import { ResizeHandle } from '@/components/ResizeHandle'
import { useResizableWidth } from '@/lib/useResizableWidth'

export type CasePickerFolder = { id: string; name: string; parentFolderId?: string }

export type CasePickerCase = {
  id: string
  title: string
  tags: string[]
  priority: Priority | ''
  platform: string
  testType: string
  folderId: string
}

type Filters = {
  tag: string
  priority: string
  platform: string
  testType: string
}

const EMPTY_FILTERS: Filters = { tag: '', priority: '', platform: '', testType: '' }

// Fixed-height virtualization constants (rework-suite-case-picker-scale design.md:
// uniform row height is a hard constraint of the windowing approach — tags are
// capped at 2 + an overflow badge below so every row is exactly ROW_HEIGHT).
const ROW_HEIGHT = 60
const VIEWPORT_HEIGHT = 384
const OVERSCAN = 6

// Pure windowing math, exported and unit-tested independent of DOM/scroll
// simulation limits in jsdom (rework-suite-case-picker-scale tasks.md 4.1).
export function computeVisibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  totalRows: number,
  overscan: number,
): { start: number; end: number } {
  if (totalRows === 0) return { start: 0, end: 0 }
  const start = Math.min(Math.max(0, Math.floor(scrollTop / rowHeight) - overscan), totalRows)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2
  const end = Math.min(totalRows, start + visibleCount)
  return { start, end }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function matches(c: CasePickerCase, filters: Filters, search: string, scopeIds: Set<string> | null) {
  if (scopeIds && !scopeIds.has(c.folderId)) return false
  if (search && !c.title.toLowerCase().includes(search)) return false
  return (
    (!filters.tag || c.tags.includes(filters.tag)) &&
    (!filters.priority || c.priority === filters.priority) &&
    (!filters.platform || c.platform === filters.platform) &&
    (!filters.testType || c.testType === filters.testType)
  )
}

function buildFolderTree(folders: CasePickerFolder[]) {
  const childrenOf = new Map<string, string[]>()
  const byId = new Map<string, CasePickerFolder>()
  for (const f of folders) byId.set(f.id, f)
  for (const f of folders) {
    const key = f.parentFolderId ?? '__root__'
    const list = childrenOf.get(key) ?? []
    list.push(f.id)
    childrenOf.set(key, list)
  }
  const subtreeCache = new Map<string, Set<string>>()
  function subtreeIds(id: string): Set<string> {
    const cached = subtreeCache.get(id)
    if (cached) return cached
    const out = new Set<string>([id])
    for (const childId of childrenOf.get(id) ?? []) {
      for (const id2 of subtreeIds(childId)) out.add(id2)
    }
    subtreeCache.set(id, out)
    return out
  }
  const root = folders.find((f) => !f.parentFolderId)
  const topLevelIds = root ? (childrenOf.get(root.id) ?? []) : (childrenOf.get('__root__') ?? [])
  return { byId, childrenOf, subtreeIds, topLevelIds }
}

function folderCaseCount(cases: CasePickerCase[], subtreeIds: (id: string) => Set<string>, folderId: string) {
  const ids = subtreeIds(folderId)
  let count = 0
  for (const c of cases) if (ids.has(c.folderId)) count++
  return count
}

function TreeNode({
  folderId,
  depth,
  tree,
  cases,
  scope,
  onSelectScope,
}: {
  folderId: string
  depth: number
  tree: ReturnType<typeof buildFolderTree>
  cases: CasePickerCase[]
  scope: string | null
  onSelectScope: (id: string) => void
}) {
  const folder = tree.byId.get(folderId)
  if (!folder) return null
  const kids = tree.childrenOf.get(folderId) ?? []
  const count = folderCaseCount(cases, tree.subtreeIds, folderId)
  const isSelected = scope === folderId
  return (
    <div>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-label={`${folder.name} (${count} ${count === 1 ? 'case' : 'cases'})`}
        tabIndex={0}
        className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm ${isSelected ? 'bg-accent font-medium text-primary' : 'hover:bg-accent'}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelectScope(folderId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelectScope(folderId)
          }
        }}
      >
        <span className="truncate" aria-hidden="true">
          {folder.name}
        </span>
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {count}
        </span>
      </div>
      {kids.map((childId) => (
        <TreeNode
          key={childId}
          folderId={childId}
          depth={depth + 1}
          tree={tree}
          cases={cases}
          scope={scope}
          onSelectScope={onSelectScope}
        />
      ))}
    </div>
  )
}

// Suite-agnostic case-picking mechanics (section-tree scoping, search, filters,
// virtualized rows, a selection that survives all of the above), extracted from
// SuiteCaseGrid (rework-run-creation-ux) so run creation can reuse the exact
// same picker instead of duplicating it. Owns only "what's selected" — never
// what the selection is for; a consumer supplies its own commit affordance.
export function CasePicker({
  cases,
  folders,
  selected,
  onToggle,
  readOnly = false,
}: {
  cases: CasePickerCase[]
  folders: CasePickerFolder[]
  selected: Set<string>
  onToggle: (caseId: string) => void
  // Genuinely disables the checkboxes (not just a visual affordance) for a
  // caller who can't edit membership — e.g. an anonymous visitor on a
  // public project, or a member without suiteEditMembership
  // (unify-authenticated-and-public-views tasks.md 2.2).
  readOnly?: boolean
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<string | null>(null)
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const railWidth = useResizableWidth({ storageKey: 'testpulse.casePickerRailWidth', defaultWidth: 224, min: 200, max: 480 })
  const [scrollTop, setScrollTop] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)

  const tree = useMemo(() => buildFolderTree(folders), [folders])

  const tagOptions = useMemo(() => {
    const values = new Set<string>()
    for (const c of cases) for (const t of c.tags) values.add(t)
    return Array.from(values).sort()
  }, [cases])
  const platformOptions = useMemo(() => distinctValues(cases, (c) => c.platform), [cases])
  const testTypeOptions = useMemo(() => distinctValues(cases, (c) => c.testType), [cases])

  const scopeIds = useMemo(() => (scope ? tree.subtreeIds(scope) : null), [scope, tree])
  const normalizedSearch = search.trim().toLowerCase()

  const visible = useMemo(() => {
    const matching = cases.filter((c) => matches(c, filters, normalizedSearch, scopeIds))
    if (!selectedOnly) return matching
    return matching.filter((c) => selected.has(c.id))
  }, [cases, filters, normalizedSearch, scopeIds, selectedOnly, selected])

  const anyFilterActive = filters.tag || filters.priority || filters.platform || filters.testType

  function resetScroll() {
    setScrollTop(0)
    if (viewportRef.current) viewportRef.current.scrollTop = 0
  }

  function selectScope(id: string) {
    setScope((prev) => (prev === id ? prev : id))
    resetScroll()
  }
  function clearScope() {
    setScope(null)
    resetScroll()
  }

  const { start, end } = computeVisibleRange(scrollTop, VIEWPORT_HEIGHT, ROW_HEIGHT, visible.length, OVERSCAN)
  const slice = visible.slice(start, end)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <div className="relative min-w-[180px] flex-1">
          <input
            type="text"
            aria-label="Search case titles"
            placeholder="Search case titles…"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetScroll()
            }}
          />
        </div>
        <select
          aria-label="Tag"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.tag}
          onChange={(e) => {
            setFilters((f) => ({ ...f, tag: e.target.value }))
            resetScroll()
          }}
        >
          <option value="">All tags</option>
          {tagOptions.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <select
          aria-label="Priority"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.priority}
          onChange={(e) => {
            setFilters((f) => ({ ...f, priority: e.target.value }))
            resetScroll()
          }}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <select
          aria-label="Platform"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.platform}
          onChange={(e) => {
            setFilters((f) => ({ ...f, platform: e.target.value }))
            resetScroll()
          }}
        >
          <option value="">All platforms</option>
          {platformOptions.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <select
          aria-label="Test type"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.testType}
          onChange={(e) => {
            setFilters((f) => ({ ...f, testType: e.target.value }))
            resetScroll()
          }}
        >
          <option value="">All test types</option>
          {testTypeOptions.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="text-sm font-medium text-primary underline underline-offset-2 disabled:text-muted-foreground disabled:no-underline"
          disabled={!anyFilterActive}
          onClick={() => {
            setFilters(EMPTY_FILTERS)
            resetScroll()
          }}
        >
          Clear filters
        </button>
        <button
          type="button"
          aria-pressed={selectedOnly}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedOnly ? 'border-primary bg-accent text-primary' : 'border-input text-muted-foreground'}`}
          onClick={() => {
            setSelectedOnly((v) => !v)
            resetScroll()
          }}
        >
          Selected only ({selected.size})
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Scope: <span className="font-medium text-foreground">{scope ? tree.byId.get(scope)?.name : 'All sections'}</span>
        </span>
        {scope && (
          <button type="button" className="text-primary underline underline-offset-2" onClick={clearScope}>
            Clear scope
          </button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{visible.length}</span> of {cases.length} cases
      </p>

      <div className="flex overflow-hidden rounded-md border">
        {!railCollapsed && (
          <>
            <div className="shrink-0 border-r" style={{ width: railWidth.width }}>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="tp-label">Sections</span>
                <button type="button" className="text-xs text-primary" onClick={() => setRailCollapsed(true)}>
                  Hide
                </button>
              </div>
              <div role="tree" aria-label="Sections" className="max-h-96 overflow-y-auto px-1 pb-2">
                <div
                  role="treeitem"
                  aria-selected={scope === null}
                  aria-label={`All sections (${cases.length} ${cases.length === 1 ? 'case' : 'cases'})`}
                  tabIndex={0}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm font-medium ${scope === null ? 'bg-accent text-primary' : 'hover:bg-accent'}`}
                  onClick={clearScope}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      clearScope()
                    }
                  }}
                >
                  <span aria-hidden="true">All sections</span>
                  <span className="text-xs text-muted-foreground" aria-hidden="true">
                    {cases.length}
                  </span>
                </div>
                {tree.topLevelIds.map((id) => (
                  <TreeNode key={id} folderId={id} depth={0} tree={tree} cases={cases} scope={scope} onSelectScope={selectScope} />
                ))}
              </div>
            </div>
            <ResizeHandle
              width={railWidth.width}
              min={200}
              max={480}
              onResize={railWidth.setWidth}
              onKeyDown={railWidth.onKeyDown}
            />
          </>
        )}
        {railCollapsed && (
          <button
            type="button"
            className="shrink-0 border-r px-1 text-xs text-primary"
            style={{ writingMode: 'vertical-rl' }}
            onClick={() => setRailCollapsed(false)}
          >
            Show sections
          </button>
        )}

        <div className="min-w-0 flex-1">
          {visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">No cases match these filters</p>
              <p>Try a different combination, or clear the filters/scope to see all cases.</p>
            </div>
          ) : (
            <div
              ref={viewportRef}
              data-testid="case-picker-viewport"
              className="relative overflow-y-auto"
              style={{ height: VIEWPORT_HEIGHT }}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
              <div style={{ height: visible.length * ROW_HEIGHT, position: 'relative' }}>
                {slice.map((c, i) => (
                  <label
                    key={c.id}
                    className="absolute inset-x-0 flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 hover:bg-accent"
                    style={{ top: (start + i) * ROW_HEIGHT, height: ROW_HEIGHT }}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(c.id)}
                      onChange={() => onToggle(c.id)}
                      disabled={readOnly}
                      aria-label={c.title}
                    />
                    <span className="min-w-0 space-y-1">
                      <span className="block truncate text-sm font-medium">{c.title}</span>
                      {scope === null && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {tree.byId.get(c.folderId)?.name ?? ''}
                        </span>
                      )}
                      <span className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        <ClassificationPills priority={c.priority} platform={c.platform} testType={c.testType} />
                        {tagPills(c.tags)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
