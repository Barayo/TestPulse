import { api } from '@/lib/api'

// Sums every selected folder's own subtree preview (add-library-folder-selection
// design.md D6) — a known, accepted imprecision: an ancestor and its own
// descendant selected together double-counts the descendant's cases, but
// only ever overstates a destructive action's scope, never understates it.
export async function folderDeletePreviewTotal(folderIds: string[]): Promise<{ caseCount: number; folderCount: number }> {
  const previews = await Promise.all(
    folderIds.map((folderId) => api.GET('/api/v1/folders/{folderId}/delete-preview', { params: { path: { folderId } } })),
  )
  let caseCount = 0
  let folderCount = 0
  for (const { data } of previews) {
    caseCount += data?.caseCount ?? 0
    folderCount += data?.folderCount ?? 0
  }
  return { caseCount, folderCount }
}
