import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']

// buildSlugPath mirrors FolderExplorerPage's own ancestorChain walk, but
// joins each ancestor's slug instead of its display name — the root
// folder itself contributes no segment (its URL is the bare /library
// route, not /library/root).
export function buildSlugPath(folder: Folder, allFolders: Folder[]): string {
  const segments: string[] = []
  let current: Folder | undefined = folder
  while (current && current.parentFolderId) {
    segments.unshift(current.slug)
    current = allFolders.find((f) => f.id === current!.parentFolderId)
  }
  return segments.join('/')
}

// resolveSlugPath walks a slug-path segment by segment from the project's
// root folder (add-folder-slug-urls design.md): a live child's slug is
// tried first; on no live match, the full folder set is searched for one
// whose (previousParentFolderId, previousSlug) matches the currently-
// resolved node — a moved folder is no longer a live child of its old
// parent, so this can't be scoped to "the parent's own children" the way
// the live-match branch is. On a previous-identity match, remaining
// segments resolve from THAT folder's current children (it may have its
// own live subtree unaffected by the move). An empty segment (a trailing
// or doubled slash) never matches anything.
export function resolveSlugPath(
  segments: string[],
  allFolders: Folder[],
  rootId: string,
): { folder: Folder; redirected: boolean } | null {
  let currentId = rootId
  let redirected = false
  for (const segment of segments) {
    if (!segment) return null
    const live = allFolders.find((f) => f.parentFolderId === currentId && f.slug === segment)
    if (live) {
      currentId = live.id
      continue
    }
    const viaPrevious = allFolders.find((f) => f.previousParentFolderId === currentId && f.previousSlug === segment)
    if (!viaPrevious) return null
    currentId = viaPrevious.id
    redirected = true
  }
  const folder = allFolders.find((f) => f.id === currentId)
  if (!folder) return null
  return { folder, redirected }
}
