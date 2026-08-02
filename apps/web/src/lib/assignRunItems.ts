import { api } from '@/lib/api'
import type { AssigneePick } from '@/components/AssignDialog'

export async function assignRunItems(itemIds: string[], assignee: AssigneePick): Promise<void> {
  const body = assignee.kind === 'user' ? { assigneeUserId: assignee.id } : { assigneeTeamId: assignee.id }
  await Promise.all(
    itemIds.map((itemId) =>
      api.PUT('/api/v1/items/{itemId}/status', {
        params: { path: { itemId } },
        body,
      }),
    ),
  )
}
