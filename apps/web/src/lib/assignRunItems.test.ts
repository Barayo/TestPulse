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
  it('sends assigneeUserId for a user pick', async () => {
    await assignRunItems(['i1'], { kind: 'user', id: 'u1', label: 'ana@example.com' })

    expect(mockPUT).toHaveBeenCalledTimes(1)
    expect(mockPUT).toHaveBeenCalledWith(
      '/api/v1/items/{itemId}/status',
      expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { assigneeUserId: 'u1' } }),
    )
  })

  it('sends assigneeTeamId for a team pick', async () => {
    await assignRunItems(['i1'], { kind: 'team', id: 't1', label: 'QA Core' })

    expect(mockPUT).toHaveBeenCalledWith(
      '/api/v1/items/{itemId}/status',
      expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { assigneeTeamId: 't1' } }),
    )
  })

  it('calls PUT once per item id when assigning many', async () => {
    await assignRunItems(['i1', 'i2', 'i3'], { kind: 'user', id: 'u1', label: 'ana@example.com' })

    expect(mockPUT).toHaveBeenCalledTimes(3)
    for (const id of ['i1', 'i2', 'i3']) {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/status',
        expect.objectContaining({ params: { path: { itemId: id } }, body: { assigneeUserId: 'u1' } }),
      )
    }
  })
})
