import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRightIcon, FolderPlusIcon } from 'lucide-react'
import { RowActionMenu, type RowActionMenuHandle, type RowActionMenuItem } from './RowActionMenu'

export type TreeFolder = { id: string; name: string; parentFolderId?: string }

export type FolderStats = { count: number; hasCritical: boolean }

type Props = {
  folders: TreeFolder[]
  rootId: string
  selectedId: string
  expanded: Set<string>
  onSelect: (folderId: string) => void
  onToggle: (folderId: string) => void
  onNewSubfolder: (parentId: string) => void
  creatingIn?: string | null
  newFolderValue?: string
  onNewFolderValueChange?: (value: string) => void
  onConfirmNewFolder?: () => void
  onCancelNewFolder?: () => void
  // add-folder-slug-urls: surfaced under the inline create row when the
  // last confirm attempt was rejected (e.g. a sibling-name collision).
  newFolderError?: string
  onDropCase?: (caseId: string, folderId: string) => void
  // Direct-children case counts only, no recursive rollup (rework-library-ux
  // design.md) — computed client-side by the caller from data already
  // fetched, keyed by folder id. A folder with no entry renders a 0 count.
  folderStats?: Record<string, FolderStats>
  // Hides each row's "New section in…" trigger entirely for a caller
  // lacking sectionCreate — the tree's own entry point into folder
  // creation, alongside FolderExplorerPage's "+ New section" button
  // (unify-authenticated-and-public-views tasks.md 2.9). Optional,
  // defaulting to shown — FolderExplorerPage (the only real caller)
  // always passes it explicitly either way.
  canCreate?: boolean
  // Fixed at 256px until add-resizable-library-tree; now controlled by the
  // caller (FolderExplorerPage's useResizableWidth) so a drag/keyboard
  // resize can adjust it live.
  width?: number
}

// Shared with FolderExplorerPage's case rows and its inline subsection
// rows, so every drag source/drop target in the library explorer agrees
// on the same MIME type for the dragged case id.
export const CASE_ID_MIME = 'application/x-testpulse-case-id'

// Indentation grows at the normal step for the first few levels (where it
// carries real wayfinding value), then at a much smaller step beyond that —
// at extreme depth, one more level of indentation adds little navigational
// value but would otherwise keep consuming the fixed-width panel's space
// (found via a real deeply-nested section tree: unbounded 16px/level left
// almost no room for the name itself past depth ~7).
const INDENT_BASE = 8
const INDENT_STEP = 16
const INDENT_CAP_DEPTH = 5
const INDENT_REDUCED_STEP = 4

function indentPx(depth: number): number {
  if (depth <= INDENT_CAP_DEPTH) return INDENT_BASE + depth * INDENT_STEP
  return INDENT_BASE + INDENT_CAP_DEPTH * INDENT_STEP + (depth - INDENT_CAP_DEPTH) * INDENT_REDUCED_STEP
}

function InlineNewFolderRow({
  depth,
  value,
  onChange,
  onConfirm,
  onCancel,
  error,
}: {
  depth: number
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  // add-folder-slug-urls: a sibling-name collision from the last confirm
  // attempt — kept visible (and the row kept open, value intact) until the
  // user edits the field again or cancels, rather than the row silently
  // vanishing on a rejected create.
  error?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="py-1" style={{ paddingLeft: indentPx(depth) }}>
      <div className="flex items-center gap-1.5">
        <span className="w-3 shrink-0" />
        <input
          aria-label={t('FolderTree.newSectionNameAriaLabel')}
          autoFocus
          className="h-6 w-full rounded border px-1 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // See FolderExplorerPage.tsx's content-pane creator for why this
            // must stop propagation rather than rely on focus state: Enter
            // both confirms and unmounts this input in the same keydown.
            e.stopPropagation()
            if (e.key === 'Enter') onConfirm()
            if (e.key === 'Escape') onCancel()
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 pl-4.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function TreeNode({
  folder,
  depth,
  folders,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  onNewSubfolder,
  creatingIn,
  newFolderValue,
  onNewFolderValueChange,
  onConfirmNewFolder,
  onCancelNewFolder,
  newFolderError,
  onDropCase,
  folderStats,
  canCreate = true,
}: {
  folder: TreeFolder
  depth: number
} & Omit<Props, 'folders' | 'rootId'> & { folders: TreeFolder[] }) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)
  const menuRef = useRef<RowActionMenuHandle>(null)
  const children = folders.filter((f) => f.parentFolderId === folder.id)
  const isExpanded = expanded.has(folder.id)
  const isSelected = folder.id === selectedId
  const menuItems: RowActionMenuItem[] = [
    {
      label: t('FolderTree.newSectionMenuLabel'),
      icon: <FolderPlusIcon className="size-4" aria-hidden="true" />,
      onSelect: () => onNewSubfolder(folder.id),
    },
  ]

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 text-sm ${isSelected ? 'bg-accent font-medium' : ''} ${dragOver ? 'bg-primary/10' : ''}`}
        style={{ paddingLeft: indentPx(depth) }}
        onContextMenu={(e) => {
          e.preventDefault()
          menuRef.current?.openAt(e.clientX, e.clientY)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const caseId = e.dataTransfer.getData(CASE_ID_MIME)
          if (caseId) onDropCase?.(caseId, folder.id)
        }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            aria-label={isExpanded ? t('FolderTree.collapseAriaLabel', { name: folder.name }) : t('FolderTree.expandAriaLabel', { name: folder.name })}
            className="w-3 shrink-0 text-muted-foreground"
            onClick={() => onToggle(folder.id)}
          >
            <ChevronRightIcon
              className={`size-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 truncate text-left"
          onClick={() => onSelect(folder.id)}
        >
          <span className="truncate" title={folder.name}>
            {folder.name}
          </span>
          {folderStats?.[folder.id]?.hasCritical && (
            <span
              aria-label={t('FolderTree.criticalCaseAriaLabel', { name: folder.name })}
              className="size-1.5 shrink-0 rounded-full bg-destructive"
            />
          )}
          <span className="shrink-0 text-xs text-muted-foreground">{folderStats?.[folder.id]?.count ?? 0}</span>
        </button>
        {canCreate && <RowActionMenu ref={menuRef} label={t('FolderTree.newSectionInAriaLabel', { name: folder.name })} items={menuItems} />}
      </div>
      {isExpanded &&
        children.map((child) => (
          <TreeNode
            key={child.id}
            folder={child}
            depth={depth + 1}
            folders={folders}
            selectedId={selectedId}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={onToggle}
            onNewSubfolder={onNewSubfolder}
            creatingIn={creatingIn}
            newFolderValue={newFolderValue}
            onNewFolderValueChange={onNewFolderValueChange}
            onConfirmNewFolder={onConfirmNewFolder}
            onCancelNewFolder={onCancelNewFolder}
            newFolderError={newFolderError}
            onDropCase={onDropCase}
            folderStats={folderStats}
            canCreate={canCreate}
          />
        ))}
      {isExpanded && creatingIn === folder.id && (
        <InlineNewFolderRow
          depth={depth + 1}
          value={newFolderValue ?? ''}
          onChange={(v) => onNewFolderValueChange?.(v)}
          onConfirm={() => onConfirmNewFolder?.()}
          onCancel={() => onCancelNewFolder?.()}
          error={newFolderError}
        />
      )}
    </div>
  )
}

export function FolderTree({
  folders,
  rootId,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  onNewSubfolder,
  creatingIn,
  newFolderValue,
  onNewFolderValueChange,
  onConfirmNewFolder,
  onCancelNewFolder,
  newFolderError,
  onDropCase,
  folderStats,
  canCreate = true,
  width = 256,
}: Props) {
  const { t } = useTranslation()
  const topLevel = folders.filter((f) => f.parentFolderId === rootId)
  return (
    <nav aria-label={t('FolderTree.sectionTreeAriaLabel')} className="relative shrink-0 rounded-lg bg-muted/60 py-2" style={{ width }}>
      <p className="tp-label px-3 pb-1.5 text-muted-foreground">{t('FolderTree.sectionsHeading')}</p>
      {topLevel.map((folder) => (
        <TreeNode
          key={folder.id}
          folder={folder}
          depth={0}
          folders={folders}
          selectedId={selectedId}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={onToggle}
          onNewSubfolder={onNewSubfolder}
          creatingIn={creatingIn}
          newFolderValue={newFolderValue}
          onNewFolderValueChange={onNewFolderValueChange}
          onConfirmNewFolder={onConfirmNewFolder}
          onCancelNewFolder={onCancelNewFolder}
          newFolderError={newFolderError}
          onDropCase={onDropCase}
          folderStats={folderStats}
          canCreate={canCreate}
        />
      ))}
    </nav>
  )
}
