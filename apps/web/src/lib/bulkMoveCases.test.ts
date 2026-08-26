import { describe, expect, it, vi, beforeEach } from 'vitest'
import { bulkMoveCases } from './bulkMoveCases'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { PUT: vi.fn() } }))
const mockPUT = vi.mocked(api.PUT)

beforeEach(() => {
  vi.resetAllMocks()
  mockPUT.mockResolvedValue({ response: { ok: true } })
})

describe('bulkMoveCases', () => {
  it('moves a single case to the target folder', async () => {
    await bulkMoveCases(['c1'], 'f1')

    expect(mockPUT).toHaveBeenCalledTimes(1)
    expect(mockPUT).toHaveBeenCalledWith(
      '/api/v1/cases/{caseKey}/folder',
      expect.objectContaining({ params: { path: { caseKey: 'c1' } }, body: { folderId: 'f1' } }),
    )
  })

  it('moves every case in the list to the same target folder', async () => {
    await bulkMoveCases(['c1', 'c2', 'c3'], 'f2')

    expect(mockPUT).toHaveBeenCalledTimes(3)
    for (const key of ['c1', 'c2', 'c3']) {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/cases/{caseKey}/folder',
        expect.objectContaining({ params: { path: { caseKey: key } }, body: { folderId: 'f2' } }),
      )
    }
  })
})
