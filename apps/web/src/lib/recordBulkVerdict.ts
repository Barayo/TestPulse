import { api } from '@/lib/api'
import type { components } from '@testpulse/shared/api'

type Verdict = components['schemas']['Verdict']

export async function recordBulkVerdict(itemIds: string[], verdict: Verdict): Promise<void> {
  await Promise.all(
    itemIds.map((itemId) =>
      api.POST('/api/v1/items/{itemId}/results', {
        params: { path: { itemId } },
        body: { verdict },
      }),
    ),
  )
}
