import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { assignRunItems } from '@/lib/assignRunItems'
import { AssignDialog, type AssigneePick } from '@/components/AssignDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CasePicker, type CasePickerCase } from '@/components/CasePicker'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Project = components['schemas']['Project']
type Suite = components['schemas']['Suite']
type Folder = components['schemas']['Folder']

type NewRunLocationState = { seedFromSuiteKey?: string; seedName?: string } | null

function toGridCase(c: TestCase): CasePickerCase {
  return {
    id: c.key,
    title: c.content.title,
    tags: c.content.tags ?? [],
    priority: c.content.priority ?? '',
    platform: c.content.platform ?? '',
    testType: c.content.testType ?? '',
    folderId: c.folderId,
  }
}

export default function NewRunPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const bumpLanding = useBumpDataRevision()
  const permissions = useProjectPermissions(projectKey)
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [cases, setCases] = useState<TestCase[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [runName, setRunName] = useState('')
  const [defaultAssignee, setDefaultAssignee] = useState<AssigneePick | null>(null)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedSuiteKey, setSelectedSuiteKey] = useState('')
  const [seededFromSuiteName, setSeededFromSuiteName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const justSeededNameRef = useRef(false)

  const load = useCallback(async () => {
    if (!projectKey) return
    setNotFound(false)
    try {
      const [{ data: p }, { data: c }, { data: f }, { data: s }] = await Promise.all([
        api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
        api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey } } }),
        api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey } } }),
        api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey } } }),
      ])
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      setCases(c ?? [])
      setFolders(f ?? [])
      setSuites(s ?? [])
    } catch {
      setCases([])
      setFolders([])
      setSuites([])
    } finally {
      setLoaded(true)
    }
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  // Deep-link handoff from a suite's "Run suite" → "Customize selection"
  // (rework-run-creation-ux) — one-shot route-state seeding, not a durable
  // binding: a hard refresh simply shows the form in its normal empty state.
  useEffect(() => {
    if (!loaded) return
    const state = location.state as NewRunLocationState
    if (!state?.seedFromSuiteKey) return
    seedSelectionFromSuite(state.seedFromSuiteKey)
    if (state.seedName) {
      setRunName(state.seedName)
      justSeededNameRef.current = true
    }
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // Focus + select the seeded name once it's actually committed to the DOM
  // (rework-suite-run-flow design.md D5) — the value arrives via the effect
  // above, after mount, so selecting immediately there would race React's
  // commit and select the input's still-empty previous value. Guarded so a
  // later run-of-the-mill edit to `runName` (typing) never re-triggers this.
  useEffect(() => {
    if (!justSeededNameRef.current) return
    justSeededNameRef.current = false
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [runName])

  function seedSelectionFromSuite(suiteKey: string) {
    const suite = suites.find((s) => s.key === suiteKey)
    if (!suite) return
    const keys = new Set(suite.caseIds.map((id) => cases.find((c) => c.id === id)?.key ?? id))
    setSelected(keys)
    setSelectedSuiteKey(suiteKey)
    setSeededFromSuiteName(suite.name)
  }

  function handleSuiteChange(suiteKey: string) {
    if (!suiteKey) {
      setSelectedSuiteKey('')
      setSeededFromSuiteName('')
      setSelected(new Set())
      return
    }
    seedSelectionFromSuite(suiteKey)
  }

  function toggleCase(caseKey: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(caseKey)) next.delete(caseKey)
      else next.add(caseKey)
      return next
    })
  }

  async function handleCreateRun(e: FormEvent) {
    e.preventDefault()
    if (!projectKey || !runName.trim() || !loaded || selected.size === 0) return
    const { data } = await api.POST('/api/v1/projects/{projectKey}/runs', {
      params: { path: { projectKey } },
      body: {
        name: runName,
        caseKeys: Array.from(selected),
        ...(selectedSuiteKey ? { suiteKey: selectedSuiteKey } : {}),
      },
    })
    bumpLanding()
    if (data) {
      if (defaultAssignee) {
        const { data: createdItems } = await api.GET('/api/v1/runs/{runKey}/items', {
          params: { path: { runKey: data.key } },
        })
        await assignRunItems((createdItems ?? []).map((item) => item.id), defaultAssignee)
      }
      navigate(`/runs/${data.key}`, { state: { justCreated: true } })
    }
  }

  if (!projectKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Project not found. <Link to="/" className="underline">Go to Projects</Link>
      </p>
    )
  }
  // permissions !== undefined distinguishes "still loading" from "loaded
  // and confirmed missing" — matching ProjectSettingsPage's identical
  // whole-page gate — so a user who does have runCreate never sees a
  // false "denied" flash before their permissions resolve
  // (unify-authenticated-and-public-views tasks.md 2.8).
  if (permissions !== undefined && !permissions.runCreate) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have permission to create a run in this project.</p>
  }

  const gridCases = cases.map(toGridCase)
  const canCreate = loaded && runName.trim().length > 0 && selected.size > 0

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={[
          { label: 'Projects', href: '/' },
          { label: project?.name ?? '', href: `/projects/${projectKey}` },
          { label: 'Runs', href: `/projects/${projectKey}/runs` },
          { label: 'New run' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">New run</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRun} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="run-name">Name</Label>
                <Input
                  id="run-name"
                  ref={nameInputRef}
                  value={runName}
                  onChange={(e) => setRunName(e.target.value)}
                  placeholder="Sprint 1"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="run-suite">Suite (optional)</Label>
                <select
                  id="run-suite"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={selectedSuiteKey}
                  onChange={(e) => handleSuiteChange(e.target.value)}
                >
                  <option value="">No suite — ad hoc run</option>
                  {suites.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name} ({s.caseIds.length} {s.caseIds.length === 1 ? 'case' : 'cases'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="run-default-assignee">Default assignee (optional)</Label>
                <div className="flex items-center gap-2">
                  <Button
                    id="run-default-assignee"
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                    onClick={() => setAssignDialogOpen(true)}
                  >
                    {defaultAssignee ? defaultAssignee.label : 'Assign every item to…'}
                  </Button>
                  {defaultAssignee && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Clear default assignee"
                      onClick={() => setDefaultAssignee(null)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {selectedSuiteKey && (
              <p className="text-sm text-muted-foreground">
                Pre-filled from <span className="font-medium text-foreground">{seededFromSuiteName}</span> — adjust the
                selection below as needed.
              </p>
            )}

            <CasePicker cases={gridCases} folders={folders} selected={selected} onToggle={toggleCase} />

            <div className="flex items-center justify-between rounded-md border bg-accent px-4 py-2.5">
              <span className="text-sm font-medium">
                {selected.size === 0 ? 'No cases selected' : `${selected.size} selected`}
              </span>
              <Button type="submit" disabled={!canCreate}>
                Create run
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        projectKey={projectKey}
        title="Default assignee…"
        onAssign={setDefaultAssignee}
      />
    </div>
  )
}
