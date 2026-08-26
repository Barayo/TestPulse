import { describe, expect, it, vi, beforeEach } from 'vitest'
import { bulkMoveFolders } from './bulkMoveFolders'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { PUT: vi.fn() } }))
const mockPUT = vi.mocked(api.PUT)

beforeEach(() => {
  vi.resetAllMocks()
  mockPUT.mockResolvedValue({ response: { ok: true } })
})

describe('bulkMoveFolders', () => {
  it('moves a single folder to the target parent', async () => {
    await bulkMoveFolders(['f1'], 'target')

    expect(mockPUT).toHaveBeenCalledTimes(1)
    expect(mockPUT).toHaveBeenCalledWith(
      '/api/v1/folders/{folderId}',
      expect.objectContaining({ params: { path: { folderId: 'f1' } }, body: { parentFolderId: 'target' } }),
    )
  })

  it('moves every folder in the list under the same target parent', async () => {
    await bulkMoveFolders(['f1', 'f2', 'f3'], 'target')

    expect(mockPUT).toHaveBeenCalledTimes(3)
    for (const id of ['f1', 'f2', 'f3']) {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/folders/{folderId}',
        expect.objectContaining({ params: { path: { folderId: id } }, body: { parentFolderId: 'target' } }),
      )
    }
  })
})
