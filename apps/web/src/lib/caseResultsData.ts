import type { CaseResultsData } from '@/components/CaseResultsPanel'
import type { components } from '@testpulse/shared/api'

type CaseExecution = components['schemas']['CaseExecution']

export const RECENT_EXECUTIONS_LIMIT = 7

// order=recent returns most-recent-first; CaseResultsPanel draws its bar
// row oldest→newest (last bar = most recent), so this reverses on the way
// in rather than asking the panel to know about the API's own ordering.
export function toResultsData(executions: CaseExecution[]): CaseResultsData | undefined {
  if (executions.length === 0) return undefined
  const passCount = executions.filter((e) => e.status === 'pass').length
  return {
    successRate: Math.round((passCount / executions.length) * 100),
    lastRunAt: new Date(executions[0].createdAt).toLocaleDateString(),
    recent: executions
      .slice()
      .reverse()
      .map((e) => ({ verdict: e.status, date: new Date(e.createdAt).toLocaleDateString() })),
  }
}
