import { describe, expect, it, vi, beforeEach } from 'vitest'
import { assignRunItems } from './assignRunItems'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { PUT: vi.fn() } }))
const mockPUT = vi.mocked(api.PUT)

beforeEach(() => {
  vi.resetAllMocks()
  mockPUT.mockResolvedValue({ response: { ok: true } })
})

describe('assignRunItems', () => {
  it('calls PUT /items/{itemId}/status with the assignee for a single item', async () => {
    await assignRunItems(['i1'], 'ana')

    expect(mockPUT).toHaveBeenCalledTimes(1)
    expect(mockPUT).toHaveBeenCalledWith(
      '/api/v1/items/{itemId}/status',
      expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { assignee: 'ana' } }),
    )
  })

  it('calls PUT once per item id when assigning many', async () => {
    await assignRunItems(['i1', 'i2', 'i3'], 'ana')

    expect(mockPUT).toHaveBeenCalledTimes(3)
    for (const id of ['i1', 'i2', 'i3']) {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/status',
        expect.objectContaining({ params: { path: { itemId: id } }, body: { assignee: 'ana' } }),
      )
    }
  })

  it('resolves only after every call has completed', async () => {
    let resolveSecond!: () => void
    mockPUT
      .mockResolvedValueOnce({ response: { ok: true } })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = () => resolve({ response: { ok: true } })
        }),
      )

    let done = false
    const promise = assignRunItems(['i1', 'i2'], 'ana').then(() => {
      done = true
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(done).toBe(false)

    resolveSecond()
    await promise
    expect(done).toBe(true)
  })
})
