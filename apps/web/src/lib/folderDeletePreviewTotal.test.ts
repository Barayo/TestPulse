import { describe, expect, it, vi, beforeEach } from 'vitest'
import { folderDeletePreviewTotal } from './folderDeletePreviewTotal'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('folderDeletePreviewTotal', () => {
  it('fetches and returns a single folder\'s own preview', async () => {
    mockGET.mockResolvedValue({ data: { caseCount: 5, folderCount: 2 }, response: { ok: true } })

    const total = await folderDeletePreviewTotal(['f1'])

    expect(mockGET).toHaveBeenCalledWith(
      '/api/v1/folders/{folderId}/delete-preview',
      expect.objectContaining({ params: { path: { folderId: 'f1' } } }),
    )
    expect(total).toEqual({ caseCount: 5, folderCount: 2 })
  })

  it('sums previews across every selected folder, fetched in parallel', async () => {
    mockGET.mockImplementation((_path: string, options: { params: { path: { folderId: string } } }) => {
      const previews: Record<string, { caseCount: number; folderCount: number }> = {
        f1: { caseCount: 5, folderCount: 2 },
        f2: { caseCount: 3, folderCount: 0 },
      }
      return Promise.resolve({ data: previews[options.params.path.folderId], response: { ok: true } })
    })

    const total = await folderDeletePreviewTotal(['f1', 'f2'])

    expect(mockGET).toHaveBeenCalledTimes(2)
    expect(total).toEqual({ caseCount: 8, folderCount: 2 })
  })

  it('returns zero/zero for an empty folder id list', async () => {
    const total = await folderDeletePreviewTotal([])
    expect(mockGET).not.toHaveBeenCalled()
    expect(total).toEqual({ caseCount: 0, folderCount: 0 })
  })
})
