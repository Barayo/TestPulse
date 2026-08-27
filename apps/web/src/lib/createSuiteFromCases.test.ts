import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSuiteFromCases } from './createSuiteFromCases'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { POST: vi.fn(), PUT: vi.fn() } }))
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)

const createdSuite = { key: 's1', name: 'Smoke' }

beforeEach(() => {
  vi.resetAllMocks()
  mockPOST.mockResolvedValue({ data: createdSuite, response: { ok: true } } as never)
  mockPUT.mockResolvedValue({ response: { ok: true } } as never)
})

describe('createSuiteFromCases', () => {
  it('creates the suite with the given name', async () => {
    await createSuiteFromCases('p1', 'Smoke', ['SP-12'])

    expect(mockPOST).toHaveBeenCalledWith(
      '/api/v1/projects/{projectKey}/suites',
      expect.objectContaining({ params: { path: { projectKey: 'p1' } }, body: { name: 'Smoke' } }),
    )
  })

  it('adds every case as a member of the created suite', async () => {
    await createSuiteFromCases('p1', 'Smoke', ['SP-12', 'SP-13', 'SP-14'])

    expect(mockPUT).toHaveBeenCalledTimes(3)
    for (const caseKey of ['SP-12', 'SP-13', 'SP-14']) {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}/cases/{caseKey}',
        expect.objectContaining({ params: { path: { suiteKey: 's1', caseKey } } }),
      )
    }
  })

  it('returns the created suite', async () => {
    const result = await createSuiteFromCases('p1', 'Smoke', ['SP-12'])
    expect(result).toEqual(createdSuite)
  })

  it('creates the suite with no membership calls when given no case keys', async () => {
    await createSuiteFromCases('p1', 'Smoke', [])
    expect(mockPUT).not.toHaveBeenCalled()
  })
})
