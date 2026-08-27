import { subtreeIds } from '@/lib/subtreeIds'
import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']
type TestCase = components['schemas']['TestCase']

// add-suite-from-library-selection design.md D7 — resolves a Library
// selection (folder ids + case keys) into the deduplicated set of case keys
// that become a new suite's members. A selected folder contributes every
// case anywhere in its subtree, at any depth (subtreeIds is recursive and
// already includes the folder itself). Purely client-side: folders/cases
// are already loaded in full by FolderExplorerPage.tsx, so no new fetch or
// backend endpoint is needed.
export function resolveSuiteCaseKeys(
  selectedFolderIds: string[],
  selectedCaseKeys: string[],
  folders: Folder[],
  cases: TestCase[],
): string[] {
  const folderScope = new Set(selectedFolderIds.flatMap((id) => [...subtreeIds(folders, id)]))
  const fromFolders = cases.filter((c) => folderScope.has(c.folderId)).map((c) => c.key)
  return [...new Set([...selectedCaseKeys, ...fromFolders])]
}
