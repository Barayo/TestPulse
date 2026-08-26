import { api } from '@/lib/api'

export async function bulkMoveFolders(folderIds: string[], targetParentId: string): Promise<void> {
  await Promise.all(
    folderIds.map((folderId) =>
      api.PUT('/api/v1/folders/{folderId}', {
        params: { path: { folderId } },
        body: { parentFolderId: targetParentId },
      }),
    ),
  )
}
