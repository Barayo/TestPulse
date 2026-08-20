import { describe, expect, it } from 'vitest'
import { toResultsData } from './caseResultsData'
import type { components } from '@testpulse/shared/api'

type CaseExecution = components['schemas']['CaseExecution']

function execution(overrides: Partial<CaseExecution>): CaseExecution {
  return {
    runItemId: 'i1',
    runId: 'r1',
    runKey: 'R-1',
    runName: 'run 1',
    caseVersion: 1,
    status: 'pass',
    createdAt: '2026-07-18T10:00:00Z',
    ...overrides,
  }
}

describe('toResultsData', () => {
  it('returns undefined for an empty execution list', () => {
    expect(toResultsData([])).toBeUndefined()
  })

  it('reverses order=recent (most-recent-first) into oldest-first bars, and computes the pass rate', () => {
    const result = toResultsData([
      execution({ runItemId: 'i3', status: 'pass', createdAt: '2026-07-20T10:00:00Z' }),
      execution({ runItemId: 'i2', status: 'failed', createdAt: '2026-07-19T10:00:00Z' }),
      execution({ runItemId: 'i1', status: 'pass', createdAt: '2026-07-18T10:00:00Z' }),
    ])

    expect(result?.successRate).toBe(67)
    expect(result?.lastRunAt).toBe(new Date('2026-07-20T10:00:00Z').toLocaleDateString())
    expect(result?.recent.map((r) => r.verdict)).toEqual(['pass', 'failed', 'pass'])
  })
})
