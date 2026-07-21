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

// Full path so same-named sections at different depths aren't ambiguous —
// e.g. "Library / Transferencias / Nacionales".
function folderPath(folders: PickerFolder[], folderId: string, rootId: string): string {
  if (folderId === rootId) return 'Library'
  return ['Library', ...ancestorChain(folders, folderId).map((f) => f.name)].join(' / ')
}

type Props = {
  folders: PickerFolder[]
  rootId: string
  query: string
  onQueryChange: (query: string) => void
  onSelect: (folderId: string) => void
}

// Shared by "Move to…" (onSelect moves the open case) and, below 768px,
// "Browse sections" (onSelect navigates instead) — one picker, two behaviors
// passed in by the caller.
export function FolderPicker({ folders, rootId, query, onQueryChange, onSelect }: Props) {
  const paths = folders
    .map((f) => ({ id: f.id, path: folderPath(folders, f.id, rootId) }))
    .filter((f) => f.path.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        placeholder="Search sections…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {paths.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
              onClick={() => onSelect(f.id)}
            >
              {f.path}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
