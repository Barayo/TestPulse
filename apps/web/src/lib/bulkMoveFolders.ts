import { api } from '@/lib/api'

// See bulkDeleteFolders.ts for why this returns an error message instead of
// discarding each request's outcome — a bulk move can now be rejected for a
// sibling-slug collision at the destination (add-folder-slug-urls), not
// just a cross-project/cycle check, so a silent no-op is more likely.
export async function bulkMoveFolders(folderIds: string[], targetParentId: string): Promise<string | undefined> {
  const results = await Promise.all(
    folderIds.map((folderId) =>
      api.PUT('/api/v1/folders/{folderId}', {
        params: { path: { folderId } },
        body: { parentFolderId: targetParentId },
      }),
    ),
  )
  const failures = results.filter(({ response }) => !response.ok).length
  if (failures === 0) return undefined
  if (failures === folderIds.length) return 'Could not move the selected sections.'
  return `Could not move ${failures} of ${folderIds.length} sections.`
}
