import { api } from '@/lib/api'
import type { components } from '@testpulse/shared/api'

type Verdict = components['schemas']['Verdict']

export interface BulkVerdictResult {
  failedCount: number
}

// openapi-fetch resolves rather than throws on a 4xx, so a rejected item
// (e.g. assignee-restricted-recording's 403) would otherwise be silently
// dropped — failedCount lets callers surface it instead.
export async function recordBulkVerdict(itemIds: string[], verdict: Verdict): Promise<BulkVerdictResult> {
  const results = await Promise.all(
    itemIds.map((itemId) =>
      api.POST('/api/v1/items/{itemId}/results', {
        params: { path: { itemId } },
        body: { verdict },
      }),
    ),
  )
  return { failedCount: results.filter((r) => r.error).length }
}
