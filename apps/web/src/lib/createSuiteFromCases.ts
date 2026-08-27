import { api } from '@/lib/api'
import type { components } from '@testpulse/shared/api'

type Suite = components['schemas']['Suite']

// add-suite-from-library-selection design.md D5 — mirrors
// bulkMoveCases.ts/bulkDeleteCases.ts's client-orchestration shape: no
// dedicated bulk-membership endpoint exists, so this loops the existing
// single-case membership PUT once per (already D7-resolved) case key.
export async function createSuiteFromCases(projectKey: string, name: string, caseKeys: string[]): Promise<Suite> {
  const { data: suite } = await api.POST('/api/v1/projects/{projectKey}/suites', {
    params: { path: { projectKey } },
    body: { name },
  })
  await Promise.all(
    caseKeys.map((caseKey) =>
      api.PUT('/api/v1/suites/{suiteKey}/cases/{caseKey}', {
        params: { path: { suiteKey: suite!.key, caseKey } },
      }),
    ),
  )
  return suite as Suite
}
