import type { components } from '@testpulse/shared/api'

type RunItem = components['schemas']['RunItem']

// A run item's own detail URL. The route is keyed by caseKey, not the
// item's own id — testName disambiguates the multiple items that can now
// share one caseKey within a run: a parameterized case's several expanded
// rows (add-parameterized-cases, each carrying its row Name as testName),
// or several externally-imported results for the same case. Absent for a
// plain manually-added item, where caseKey alone was always unambiguous.
export function runItemUrl(runKey: string, item: Pick<RunItem, 'caseKey' | 'testName'>): string {
  const base = `/runs/${runKey}/items/${item.caseKey}`
  return item.testName ? `${base}?row=${encodeURIComponent(item.testName)}` : base
}
