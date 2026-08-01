import { api } from '@/lib/api'

export async function assignRunItems(itemIds: string[], assignee: string): Promise<void> {
  await Promise.all(
    itemIds.map((itemId) =>
      api.PUT('/api/v1/items/{itemId}/status', {
        params: { path: { itemId } },
        body: { assignee },
      }),
    ),
  )
}
