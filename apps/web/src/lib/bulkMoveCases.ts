import { api } from '@/lib/api'

// See bulkDeleteFolders.ts for why this returns an error message instead of
// discarding each request's outcome.
export async function bulkMoveCases(caseKeys: string[], targetFolderId: string): Promise<string | undefined> {
  const results = await Promise.all(
    caseKeys.map((caseKey) =>
      api.PUT('/api/v1/cases/{caseKey}/folder', {
        params: { path: { caseKey } },
        body: { folderId: targetFolderId },
      }),
    ),
  )
  const failures = results.filter(({ response }) => !response.ok).length
  if (failures === 0) return undefined
  if (failures === caseKeys.length) return 'Could not move the selected cases.'
  return `Could not move ${failures} of ${caseKeys.length} cases.`
}
