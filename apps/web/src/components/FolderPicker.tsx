import { FolderIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'

export type PickerFolder = { id: string; name: string; parentFolderId?: string }

function ancestorChain(folders: PickerFolder[], folderId: string): PickerFolder[] {
  const chain: PickerFolder[] = []
  let current = folders.find((f) => f.id === folderId)
  while (current && current.parentFolderId) {
    chain.unshift(current)
    current = folders.find((f) => f.id === current!.parentFolderId)
  }
  return chain
}

// Full path for disambiguation (a title-attribute tooltip, not the row's
// visible label) — same-named sections at different depths would otherwise
// be indistinguishable once rows show just their own name.
function folderPath(folders: PickerFolder[], folderId: string, rootId: string): string {
  if (folderId === rootId) return 'Library'
  return ['Library', ...ancestorChain(folders, folderId).map((f) => f.name)].join(' / ')
}

function displayName(folder: PickerFolder, rootId: string): string {
  return folder.id === rootId ? 'Library' : folder.name
}

type Props = {
  folders: PickerFolder[]
  rootId: string
  query: string
  onQueryChange: (query: string) => void
  onSelect: (folderId: string) => void
  // Direct-children case counts, keyed by folder id (rework-library-ux) —
  // shown per row when provided; omitted entirely otherwise.
  folderStats?: Record<string, { count: number }>
}

// Shared by "Move to…" (onSelect moves the open case) and, below 768px,
// "Browse sections" (onSelect navigates instead) — one picker, two behaviors
// passed in by the caller. Shows hierarchy via indentation (rework-library-ux)
// rather than a flat list of full-path strings, with an optional per-row case
// count; search matches a folder's own name, not its full path.
export function FolderPicker({ folders, rootId, query, onQueryChange, onSelect, folderStats }: Props) {
  const normalizedQuery = query.trim().toLowerCase()
  const rows = folders
    .map((f) => ({ folder: f, depth: f.id === rootId ? 0 : ancestorChain(folders, f.id).length }))
    .filter((r) => displayName(r.folder, rootId).toLowerCase().includes(normalizedQuery))

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        placeholder="Search sections…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {rows.map(({ folder, depth }) => {
          const count = folderStats?.[folder.id]?.count
          return (
            <li key={folder.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md py-2 pr-2 text-left text-sm hover:bg-accent"
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => onSelect(folder.id)}
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" title={folderPath(folders, folder.id, rootId)}>
                  {displayName(folder, rootId)}
                </span>
                {count !== undefined && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {count} {count === 1 ? 'case' : 'cases'}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
