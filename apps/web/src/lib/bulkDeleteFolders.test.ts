import { describe, expect, it, vi, beforeEach } from 'vitest'
import { bulkDeleteFolders } from './bulkDeleteFolders'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { DELETE: vi.fn() } }))
const mockDELETE = vi.mocked(api.DELETE)

beforeEach(() => {
  vi.resetAllMocks()
  mockDELETE.mockResolvedValue({ response: { ok: true } })
})

describe('bulkDeleteFolders', () => {
  it('deletes a single folder', async () => {
    await bulkDeleteFolders(['f1'])

    expect(mockDELETE).toHaveBeenCalledTimes(1)
    expect(mockDELETE).toHaveBeenCalledWith(
      '/api/v1/folders/{folderId}',
      expect.objectContaining({ params: { path: { folderId: 'f1' } } }),
    )
  })

  it('deletes every folder in the list', async () => {
    await bulkDeleteFolders(['f1', 'f2', 'f3'])

    expect(mockDELETE).toHaveBeenCalledTimes(3)
    for (const id of ['f1', 'f2', 'f3']) {
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/folders/{folderId}',
        expect.objectContaining({ params: { path: { folderId: id } } }),
      )
    }
  })
})
