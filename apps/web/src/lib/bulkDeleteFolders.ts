import { api } from '@/lib/api'

// Returns an error message naming how many deletes failed, or undefined if
// every one succeeded (matches moveFolder's established error-surfacing
// pattern — Paco's QA pass on add-folder-slug-urls, 2026-09-10, found this
// previously discarded every delete's outcome, so a rejected delete
// silently no-oped with no feedback to the user).
export async function bulkDeleteFolders(folderIds: string[]): Promise<string | undefined> {
  const results = await Promise.all(
    folderIds.map((folderId) => api.DELETE('/api/v1/folders/{folderId}', { params: { path: { folderId } } })),
  )
  const failures = results.filter(({ response }) => !response.ok).length
  if (failures === 0) return undefined
  if (failures === folderIds.length) return 'Could not delete the selected sections.'
  return `Could not delete ${failures} of ${folderIds.length} sections.`
}
