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

  it('resolves undefined when every delete succeeds', async () => {
    const result = await bulkDeleteFolders(['f1', 'f2'])
    expect(result).toBeUndefined()
  })

  // Paco's QA pass on add-folder-slug-urls (2026-09-10): a rejected delete
  // (e.g. a slug-collision-adjacent 4xx) was silently discarded, so the
  // caller had no way to tell the user anything failed. Mirrors moveFolder's
  // established error-surfacing pattern.
  it('resolves an error message naming how many deletes failed', async () => {
    mockDELETE
      .mockResolvedValueOnce({ response: { ok: true } })
      .mockResolvedValueOnce({ response: { ok: false }, error: { error: 'nope' } })
      .mockResolvedValueOnce({ response: { ok: true } })

    const result = await bulkDeleteFolders(['f1', 'f2', 'f3'])
    expect(result).toBe('Could not delete 1 of 3 sections.')
  })

  it('resolves an error message when every delete fails', async () => {
    mockDELETE.mockResolvedValue({ response: { ok: false }, error: { error: 'nope' } })

    const result = await bulkDeleteFolders(['f1', 'f2'])
    expect(result).toBe('Could not delete the selected sections.')
  })
})
