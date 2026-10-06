import { FolderIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
function folderPath(folders: PickerFolder[], folderId: string, rootId: string, libraryLabel: string): string {
  if (folderId === rootId) return libraryLabel
  return [libraryLabel, ...ancestorChain(folders, folderId).map((f) => f.name)].join(' / ')
}

function displayName(folder: PickerFolder, rootId: string, libraryLabel: string): string {
  return folder.id === rootId ? libraryLabel : folder.name
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
  const { t } = useTranslation()
  const libraryLabel = t('FolderPicker.library')
  const normalizedQuery = query.trim().toLowerCase()
  const rows = folders
    .map((f) => ({ folder: f, depth: f.id === rootId ? 0 : ancestorChain(folders, f.id).length }))
    .filter((r) => displayName(r.folder, rootId, libraryLabel).toLowerCase().includes(normalizedQuery))

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        placeholder={t('FolderPicker.searchSectionsPlaceholder')}
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
                <span className="min-w-0 flex-1 truncate" title={folderPath(folders, folder.id, rootId, libraryLabel)}>
                  {displayName(folder, rootId, libraryLabel)}
                </span>
                {count !== undefined && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('FolderPicker.caseCount', { count, plural: count === 1 ? '' : 's' })}
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
