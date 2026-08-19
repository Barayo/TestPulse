import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/useAuth'
import { useProjectReadAccess } from '@/lib/useProjectPermissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RunListbox } from '@/components/RunListbox'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type PickerLocationState = { seedRunKey?: string } | null

export default function RunComparePickerPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const access = useProjectReadAccess(projectKey, user, authLoading)
  const [runs, setRuns] = useState<Run[]>([])
  const [runKeyA, setRunKeyA] = useState(() => (location.state as PickerLocationState)?.seedRunKey ?? '')
  const [runKeyB, setRunKeyB] = useState('')

  // One-shot deep-link seeding (e.g. a run row's "Compare…" action) — not a
  // durable binding, matching NewRunPage.tsx's identical seedFromSuiteKey
  // pattern: clear the state immediately so a later re-render/remount at
  // this route never re-applies it.
  useEffect(() => {
    if (!(location.state as PickerLocationState)?.seedRunKey) return
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    if (!projectKey || access === 'loading') return
    const request = access === 'member'
      ? api.GET('/api/v1/projects/{projectKey}/runs', { params: { path: { projectKey } } })
      : api.GET('/api/v1/public/projects/{projectKey}/runs', { params: { path: { projectKey } } })
    const { data } = await request
    setRuns((data ?? []).filter((r) => r.status === 'closed'))
  }, [projectKey, access])

  useEffect(() => {
    void load()
  }, [load])

  if (!projectKey) return null

  function submit() {
    if (!runKeyA || !runKeyB) return
    navigate(`/runs/compare/${runKeyA}/${runKeyB}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="tp-heading">Compare runs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* A native <label> wrapping the listbox would work fine for a real
            <select> (a labelable, natively-interactive element), but clicking
            a role="option" <li> — not itself labelable — inside a <label>
            makes the browser forward a synthetic click to the labelable
            descendant (the trigger <button>), reopening the popup right after
            selection closes it (found live via a persistent "element
            intercepts pointer events" E2E failure). Plain text + the
            RunListbox's own aria-label instead — no label/for association
            needed since the trigger already names itself accessibly. */}
        <div className="flex flex-col gap-1 text-sm">
          First run
          <RunListbox
            label="First run"
            runs={runs.filter((r) => r.key !== runKeyB)}
            value={runKeyA}
            onChange={setRunKeyA}
            placeholder="Select a closed run…"
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          Second run
          <RunListbox
            label="Second run"
            runs={runs.filter((r) => r.key !== runKeyA)}
            value={runKeyB}
            onChange={setRunKeyB}
            placeholder="Select a closed run…"
          />
        </div>
        <Button type="button" disabled={!runKeyA || !runKeyB} onClick={submit}>
          Compare
        </Button>
      </CardContent>
    </Card>
  )
}
