import { useState } from 'react'

export type TreeFolder = { id: string; name: string; parentFolderId?: string }

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
}

function InlineNewFolderRow({
  depth,
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  depth: number
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: 8 + depth * 16 }}>
      <span className="w-3 shrink-0" />
      <input
        aria-label="New section name"
        autoFocus
        className="h-6 w-full rounded border px-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm()
          if (e.key === 'Escape') onCancel()
        }}
      />
    </div>
  )
}

function ContextMenu({
  x,
  y,
  onNewSubfolder,
  onClose,
}: {
  x: number
  y: number
  onNewSubfolder: () => void
  onClose: () => void
}) {
  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        data-testid="context-menu-backdrop"
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        role="menu"
        className="fixed z-50 min-w-40 rounded-md border bg-popover p-1 text-sm shadow-md"
        style={{ left: x, top: y }}
      >
        <button
          role="menuitem"
          type="button"
          className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
          onClick={() => {
            onNewSubfolder()
            onClose()
          }}
        >
          New section
        </button>
      </div>
    </>
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
}: {
  folder: TreeFolder
  depth: number
} & Omit<Props, 'folders' | 'rootId'> & { folders: TreeFolder[] }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const children = folders.filter((f) => f.parentFolderId === folder.id)
  const isExpanded = expanded.has(folder.id)
  const isSelected = folder.id === selectedId

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 text-sm ${isSelected ? 'bg-accent font-medium' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            className="w-3 shrink-0 text-xs text-muted-foreground"
            onClick={() => onToggle(folder.id)}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <button type="button" className="truncate text-left" onClick={() => onSelect(folder.id)}>
          {folder.name}
        </button>
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
          />
        ))}
      {isExpanded && creatingIn === folder.id && (
        <InlineNewFolderRow
          depth={depth + 1}
          value={newFolderValue ?? ''}
          onChange={(v) => onNewFolderValueChange?.(v)}
          onConfirm={() => onConfirmNewFolder?.()}
          onCancel={() => onCancelNewFolder?.()}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onNewSubfolder={() => onNewSubfolder(folder.id)}
          onClose={() => setMenu(null)}
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
}: Props) {
  const topLevel = folders.filter((f) => f.parentFolderId === rootId)
  return (
    <nav aria-label="Section tree" className="w-64 shrink-0 border-r py-2">
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
        />
      ))}
    </nav>
  )
}
