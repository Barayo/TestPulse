import { api } from '@/lib/api'

export async function bulkMoveCases(caseKeys: string[], targetFolderId: string): Promise<void> {
  await Promise.all(
    caseKeys.map((caseKey) =>
      api.PUT('/api/v1/cases/{caseKey}/folder', {
        params: { path: { caseKey } },
        body: { folderId: targetFolderId },
      }),
    ),
  )
}
