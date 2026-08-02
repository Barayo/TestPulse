import { describe, expect, it, vi, beforeEach } from 'vitest'
import { recordBulkVerdict } from './recordBulkVerdict'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { POST: vi.fn() } }))
const mockPOST = vi.mocked(api.POST)

beforeEach(() => {
  vi.resetAllMocks()
  mockPOST.mockResolvedValue({ response: { ok: true } })
})

describe('recordBulkVerdict', () => {
  it('sends the verdict to each item id', async () => {
    await recordBulkVerdict(['i1'], 'pass')

    expect(mockPOST).toHaveBeenCalledTimes(1)
    expect(mockPOST).toHaveBeenCalledWith(
      '/api/v1/items/{itemId}/results',
      expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { verdict: 'pass' } }),
    )
  })

  it('calls POST once per item id when recording for many items', async () => {
    await recordBulkVerdict(['i1', 'i2', 'i3'], 'failed')

    expect(mockPOST).toHaveBeenCalledTimes(3)
    for (const id of ['i1', 'i2', 'i3']) {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({ params: { path: { itemId: id } }, body: { verdict: 'failed' } }),
      )
    }
  })
})
