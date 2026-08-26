import { api } from '@/lib/api'

export async function bulkDeleteCases(caseKeys: string[]): Promise<void> {
  await Promise.all(caseKeys.map((caseKey) => api.DELETE('/api/v1/cases/{caseKey}', { params: { path: { caseKey } } })))
}
