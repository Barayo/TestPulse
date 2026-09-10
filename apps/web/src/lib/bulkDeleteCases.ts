import { api } from '@/lib/api'

// See bulkDeleteFolders.ts for why this returns an error message instead of
// discarding each request's outcome.
export async function bulkDeleteCases(caseKeys: string[]): Promise<string | undefined> {
  const results = await Promise.all(
    caseKeys.map((caseKey) => api.DELETE('/api/v1/cases/{caseKey}', { params: { path: { caseKey } } })),
  )
  const failures = results.filter(({ response }) => !response.ok).length
  if (failures === 0) return undefined
  if (failures === caseKeys.length) return 'Could not delete the selected cases.'
  return `Could not delete ${failures} of ${caseKeys.length} cases.`
}
