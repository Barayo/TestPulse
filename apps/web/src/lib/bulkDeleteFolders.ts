import { api } from '@/lib/api'

export async function bulkDeleteFolders(folderIds: string[]): Promise<void> {
  await Promise.all(folderIds.map((folderId) => api.DELETE('/api/v1/folders/{folderId}', { params: { path: { folderId } } })))
}
