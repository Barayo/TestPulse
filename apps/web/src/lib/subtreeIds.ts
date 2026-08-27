import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']

// Mirrors CasePicker's own buildFolderTree().subtreeIds pattern — every id
// in folderId's subtree, including itself. Shared by FolderExplorerPage.tsx
// (filtering a folder-move target list) and resolveSuiteCaseKeys.ts
// (add-suite-from-library-selection, resolving a selected folder into its
// contained cases).
export function subtreeIds(folders: Folder[], folderId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const f of folders) {
    if (!f.parentFolderId) continue
    const list = childrenOf.get(f.parentFolderId) ?? []
    list.push(f.id)
    childrenOf.set(f.parentFolderId, list)
  }
  const out = new Set<string>([folderId])
  const stack = [...(childrenOf.get(folderId) ?? [])]
  while (stack.length > 0) {
    const id = stack.pop() as string
    out.add(id)
    stack.push(...(childrenOf.get(id) ?? []))
  }
  return out
}
