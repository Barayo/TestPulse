import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon } from 'lucide-react'
import { PRIORITIES, type Priority } from '@/components/ClassificationEditor'
import { ClassificationPills, distinctValues, tagPills } from '@/components/Pills'
import { ResizeHandle } from '@/components/ResizeHandle'
import { useResizableWidth } from '@/lib/useResizableWidth'
import { isEditableElementFocused } from '@/lib/keyboardShortcutGuard'
import { RunShortcutsHint, RunShortcutsOverlay, type ShortcutEntry } from '@/components/RunShortcuts'

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
  const { t } = useTranslation()
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
        aria-label={t('CasePicker.folderAriaLabel', { name: folder.name, count, unit: count === 1 ? t('CasePicker.case') : t('CasePicker.cases') })}
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
  onToggleRange,
  readOnly = false,
}: {
  cases: CasePickerCase[]
  folders: CasePickerFolder[]
  selected: Set<string>
  onToggle: (caseId: string) => void
  // Bidirectional Shift+Click/Shift+Space range-toggle (design.md D3) — a
  // later Shift+Click's *resulting* state (the opposite of its current
  // selected.has(id)) is applied to every case between it and the anchor,
  // so a range-select can check or uncheck equally, unlike the Library's
  // additive-only bulk-select range.
  onToggleRange: (caseIds: string[], checked: boolean) => void
  // Genuinely disables the checkboxes (not just a visual affordance) for a
  // caller who can't edit membership — e.g. an anonymous visitor on a
  // public project, or a member without suiteEditMembership
  // (unify-authenticated-and-public-views tasks.md 2.2).
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const CASE_PICKER_SHORTCUTS: ShortcutEntry[] = [
    { keys: 'J/K · ↑/↓', label: t('CasePicker.shortcutMoveFocus') },
    { keys: 'Space', label: t('CasePicker.shortcutSelectFocused') },
    { keys: 'Shift+Space', label: t('CasePicker.shortcutExtendSelection') },
  ]
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [search, setSearch] = useState('')
  const [lastToggledId, setLastToggledId] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // Real focus is only transferred once the user actually drives keyboard
  // navigation (arrow keys/j-k) — not on mount, and not merely because a
  // filter/search change reset focusedIndex to 0, which would otherwise
  // silently steal focus away from whatever the user is actively doing
  // (e.g. mid-keystroke in the search box). State, not a ref: the very
  // first arrow-key press must trigger the focus effect even when
  // focusedIndex doesn't itself change (already at index 0 and pressing
  // "up"), which a ref-only flag wouldn't cause a re-render for.
  const [hasKeyboardNavigated, setHasKeyboardNavigated] = useState(false)
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

  // Bidirectional range-toggle (design.md D3): a first Shift+Click (no
  // anchor yet) is a plain single toggle via onToggle, same as no shift at
  // all. A later Shift+Click applies the clicked row's *resulting* state
  // (the opposite of its current selected.has) to the whole anchor..clicked
  // range via onToggleRange — so a range-select can check or uncheck
  // equally, unlike the Library's additive-only bulk-select range.
  function handleRowClick(caseId: string, shiftKey: boolean) {
    if (shiftKey && lastToggledId) {
      const ids = visible.map((c) => c.id)
      const fromIndex = ids.indexOf(lastToggledId)
      const toIndex = ids.indexOf(caseId)
      if (fromIndex !== -1 && toIndex !== -1) {
        const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
        const rangeIds = ids.slice(start, end + 1)
        const targetChecked = !selected.has(caseId)
        onToggleRange(rangeIds, targetChecked)
        setLastToggledId(caseId)
        return
      }
    }
    onToggle(caseId)
    setLastToggledId(caseId)
  }

  const { start, end } = computeVisibleRange(scrollTop, VIEWPORT_HEIGHT, ROW_HEIGHT, visible.length, OVERSCAN)
  const slice = visible.slice(start, end)

  // A stable (string, value-compared) signal of which cases are visible and
  // in what order — `visible` itself is a fresh array every render, so
  // depending on it directly would fire these effects on every render, not
  // just when the actual visible set changes (mirrors add-library-bulk-select's
  // identical orderedVisibleKeysSignal pattern in FolderExplorerPage.tsx).
  const visibleKeysSignal = visible.map((c) => c.id).join(',')

  useEffect(() => {
    setFocusedIndex(0)
  }, [visibleKeysSignal])

  // Real virtualized-scroll math (design.md D5), not scrollIntoView — only
  // rows inside the current windowed slice are mounted at all, so a ref to
  // an unmounted row is null. Clamps scrollTop just enough to bring the
  // focused row into the rendered window, mirroring resetScroll()'s own
  // direct-assignment idiom rather than a smooth/centering scroll.
  useEffect(() => {
    if (!viewportRef.current) return
    const targetTop = focusedIndex * ROW_HEIGHT
    const targetBottom = targetTop + ROW_HEIGHT
    const currentScrollTop = viewportRef.current.scrollTop
    let nextScrollTop = currentScrollTop
    if (targetTop < currentScrollTop) nextScrollTop = targetTop
    else if (targetBottom > currentScrollTop + VIEWPORT_HEIGHT) nextScrollTop = targetBottom - VIEWPORT_HEIGHT
    if (nextScrollTop !== currentScrollTop) {
      viewportRef.current.scrollTop = nextScrollTop
      setScrollTop(nextScrollTop)
    }
    const target = visible[focusedIndex]
    if (target && hasKeyboardNavigated && !isEditableElementFocused()) {
      rowRefs.current.get(target.id)?.focus({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, visibleKeysSignal, hasKeyboardNavigated])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableElementFocused()) return
      const key = e.key.toLowerCase()
      if (key === 'j' || key === 'arrowdown') {
        e.preventDefault()
        setHasKeyboardNavigated(true)
        setFocusedIndex((i) => Math.min(i + 1, visible.length - 1))
      } else if (key === 'k' || key === 'arrowup') {
        e.preventDefault()
        setHasKeyboardNavigated(true)
        setFocusedIndex((i) => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKeysSignal])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <div className="relative min-w-[180px] flex-1">
          <input
            type="text"
            aria-label={t('CasePicker.searchAriaLabel')}
            placeholder={t('CasePicker.searchPlaceholder')}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetScroll()
            }}
          />
        </div>
        <select
          aria-label={t('CasePicker.tagAriaLabel')}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.tag}
          onChange={(e) => {
            setFilters((f) => ({ ...f, tag: e.target.value }))
            resetScroll()
          }}
        >
          <option value="">{t('CasePicker.allTags')}</option>
          {tagOptions.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('CasePicker.priorityAriaLabel')}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.priority}
          onChange={(e) => {
            setFilters((f) => ({ ...f, priority: e.target.value }))
            resetScroll()
          }}
        >
          <option value="">{t('CasePicker.allPriorities')}</option>
          {PRIORITIES.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('CasePicker.platformAriaLabel')}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.platform}
          onChange={(e) => {
            setFilters((f) => ({ ...f, platform: e.target.value }))
            resetScroll()
          }}
        >
          <option value="">{t('CasePicker.allPlatforms')}</option>
          {platformOptions.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('CasePicker.testTypeAriaLabel')}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.testType}
          onChange={(e) => {
            setFilters((f) => ({ ...f, testType: e.target.value }))
            resetScroll()
          }}
        >
          <option value="">{t('CasePicker.allTestTypes')}</option>
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
          {t('CasePicker.clearFilters')}
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
          {t('CasePicker.selectedOnly', { count: selected.size })}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t('CasePicker.scopeLabel')} <span className="font-medium text-foreground">{scope ? tree.byId.get(scope)?.name : t('CasePicker.allSections')}</span>
        </span>
        {scope && (
          <button type="button" className="text-primary underline underline-offset-2" onClick={clearScope}>
            {t('CasePicker.clearScope')}
          </button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {t('CasePicker.showingPrefix')} <span className="font-medium text-foreground">{visible.length}</span> {t('CasePicker.showingSuffix', { count: cases.length })}
      </p>

      <div className="flex overflow-hidden rounded-md border">
        {!railCollapsed && (
          <>
            <div className="shrink-0 border-r" style={{ width: railWidth.width }}>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="tp-label">{t('CasePicker.sections')}</span>
                <button type="button" className="text-xs text-primary" onClick={() => setRailCollapsed(true)}>
                  {t('CasePicker.hide')}
                </button>
              </div>
              <div role="tree" aria-label={t('CasePicker.sections')} className="max-h-96 overflow-y-auto px-1 pb-2">
                <div
                  role="treeitem"
                  aria-selected={scope === null}
                  aria-label={t('CasePicker.folderAriaLabel', { name: t('CasePicker.allSections'), count: cases.length, unit: cases.length === 1 ? t('CasePicker.case') : t('CasePicker.cases') })}
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
                  <span aria-hidden="true">{t('CasePicker.allSections')}</span>
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
            {t('CasePicker.showSections')}
          </button>
        )}

        <div className="min-w-0 flex-1">
          {visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">{t('CasePicker.noCasesMatch')}</p>
              <p>{t('CasePicker.noCasesHint')}</p>
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
                {slice.map((c, i) => {
                  const checked = selected.has(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={c.title}
                      disabled={readOnly}
                      className={`absolute inset-x-0 flex items-start gap-3 border-b px-3 py-2.5 text-left hover:bg-accent disabled:cursor-not-allowed ${checked ? 'bg-primary/10' : ''}`}
                      style={{ top: (start + i) * ROW_HEIGHT, height: ROW_HEIGHT }}
                      ref={(el) => {
                        if (el) rowRefs.current.set(c.id, el)
                        else rowRefs.current.delete(c.id)
                      }}
                      tabIndex={start + i === focusedIndex ? 0 : -1}
                      onClick={(e) => {
                        setFocusedIndex(start + i)
                        handleRowClick(c.id, e.shiftKey)
                      }}
                      onKeyDown={(e) => {
                        // Space only, matching a native checkbox's own keyboard
                        // contract (design.md D6) — Enter has no "open"
                        // destination here the way it does for the Library's
                        // rows, so it's deliberately left unbound. Handles
                        // Shift+Space too (via the same handleRowClick used by
                        // click/shift-click) — roving tabindex means the row
                        // with real focus always matches focusedIndex, so no
                        // separate global Shift+Space handler is needed.
                        if (e.key === ' ') {
                          e.preventDefault()
                          handleRowClick(c.id, e.shiftKey)
                        } else if (e.key === 'Enter') {
                          // A native <button> activates on Enter by default —
                          // suppressed here since Enter is deliberately unbound.
                          e.preventDefault()
                        }
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                        }`}
                      >
                        {checked && <CheckIcon className="size-3" strokeWidth={3} />}
                      </span>
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
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <RunShortcutsHint shortcuts={CASE_PICKER_SHORTCUTS} />
      <RunShortcutsOverlay shortcuts={CASE_PICKER_SHORTCUTS} />
    </div>
  )
}
