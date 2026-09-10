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

  it('resolves undefined when every move succeeds', async () => {
    const result = await bulkMoveFolders(['f1', 'f2'], 'target')
    expect(result).toBeUndefined()
  })

  // Paco's QA pass on add-folder-slug-urls (2026-09-10): a bulk move can now
  // legitimately fail on a sibling-slug collision at the destination, but the
  // failure was silently discarded — the dialog closed as if it had worked.
  it('resolves an error message naming how many moves failed', async () => {
    mockPUT
      .mockResolvedValueOnce({ response: { ok: false }, error: { error: 'a section named "Auth" already exists here' } })
      .mockResolvedValueOnce({ response: { ok: true } })

    const result = await bulkMoveFolders(['f1', 'f2'], 'target')
    expect(result).toBe('Could not move 1 of 2 sections.')
  })

  it('resolves an error message when every move fails', async () => {
    mockPUT.mockResolvedValue({ response: { ok: false }, error: { error: 'nope' } })

    const result = await bulkMoveFolders(['f1', 'f2'], 'target')
    expect(result).toBe('Could not move the selected sections.')
  })
})
