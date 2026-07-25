import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { SuiteCaseGrid, type SuiteCaseGridCase } from '@/components/SuiteCaseGrid'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']

function toGridCase(c: TestCase): SuiteCaseGridCase {
  return {
    id: c.key,
    title: c.content.title,
    tags: c.content.tags ?? [],
    priority: c.content.priority ?? '',
    platform: c.content.platform ?? '',
    testType: c.content.testType ?? '',
  }
}

export default function SuitesPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const location = useLocation()
  const bumpLanding = useBumpDataRevision()
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [cases, setCases] = useState<TestCase[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [suiteName, setSuiteName] = useState('')
  const [createSelected, setCreateSelected] = useState<Set<string>>(new Set())
  const [openSuiteKey, setOpenSuiteKey] = useState<string | undefined>(
    location.hash.startsWith('#suite-') ? location.hash.slice('#suite-'.length) : undefined,
  )
  const [editSelected, setEditSelected] = useState<Set<string>>(new Set())
  const [editBaseline, setEditBaseline] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!projectKey) return
    setNotFound(false)
    try {
      const [{ data: p }, { data: c }, { data: s }] = await Promise.all([
        api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
        api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey } } }),
        api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey } } }),
      ])
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      setCases(c ?? [])
      setSuites(s ?? [])
    } catch {
      setCases([])
      setSuites([])
    }
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  const gridCases = useMemo(() => cases.map(toGridCase), [cases])
  const openSuite = suites.find((s) => s.key === openSuiteKey)

  // A suite's caseIds are the case's db id; the grid keys everything by case
  // key. An id with no matching case (soft-deleted) has no key to key it by
  // and no row to render — kept as the raw db id so it stays in the set,
  // untouched, and never generates a spurious remove call (design.md).
  useEffect(() => {
    if (!openSuite) return
    const asKeys = new Set(
      openSuite.caseIds.map((id) => cases.find((c) => c.id === id)?.key ?? id),
    )
    setEditSelected(asKeys)
    setEditBaseline(asKeys)
  }, [openSuite, cases])

  function toggleCreate(caseKey: string) {
    setCreateSelected((prev) => {
      const next = new Set(prev)
      if (next.has(caseKey)) next.delete(caseKey)
      else next.add(caseKey)
      return next
    })
  }

  function toggleEdit(caseKey: string) {
    setEditSelected((prev) => {
      const next = new Set(prev)
      if (next.has(caseKey)) next.delete(caseKey)
      else next.add(caseKey)
      return next
    })
  }

  async function handleCreateSuite() {
    if (!projectKey || !suiteName.trim()) return
    const { data: created } = await api.POST('/api/v1/projects/{projectKey}/suites', {
      params: { path: { projectKey } },
      body: { name: suiteName },
    })
    if (created) {
      await Promise.all(
        Array.from(createSelected).map((caseKey) =>
          api.PUT('/api/v1/suites/{suiteKey}/cases/{caseKey}', { params: { path: { suiteKey: created.key, caseKey } } }),
        ),
      )
    }
    setSuiteName('')
    setCreateSelected(new Set())
    await load()
    bumpLanding()
  }

  async function handleSaveEdit() {
    if (!openSuite) return
    const added = Array.from(editSelected).filter((id) => !editBaseline.has(id))
    const removed = Array.from(editBaseline).filter((id) => !editSelected.has(id))
    await Promise.all([
      ...added.map((caseKey) =>
        api.PUT('/api/v1/suites/{suiteKey}/cases/{caseKey}', { params: { path: { suiteKey: openSuite.key, caseKey } } }),
      ),
      ...removed.map((caseKey) =>
        api.DELETE('/api/v1/suites/{suiteKey}/cases/{caseKey}', { params: { path: { suiteKey: openSuite.key, caseKey } } }),
      ),
    ])
    setOpenSuiteKey(undefined)
    await load()
    bumpLanding()
  }

  if (!projectKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Project not found. <Link to="/" className="underline">Go to Projects</Link>
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={[
          { label: 'Projects', href: '/' },
          { label: project?.name ?? '', href: `/projects/${projectKey}` },
          { label: 'Suites' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">New suite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-md space-y-1">
            <Label htmlFor="suite-name">Suite name</Label>
            <Input
              id="suite-name"
              value={suiteName}
              onChange={(e) => setSuiteName(e.target.value)}
              placeholder="Smoke"
            />
          </div>
          <SuiteCaseGrid
            cases={gridCases}
            selected={createSelected}
            onToggle={toggleCreate}
            commitLabel={`Create suite (${createSelected.size})`}
            commitDisabled={!suiteName.trim()}
            onCommit={() => void handleCreateSuite()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">Suites</CardTitle>
        </CardHeader>
        <CardContent>
          {suites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suites yet.</p>
          ) : (
            <ul aria-label="Suites" className="divide-y rounded-md border text-sm">
              {suites.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent"
                    onClick={() => setOpenSuiteKey(s.key)}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-muted-foreground">
                      {s.caseIds.length} {s.caseIds.length === 1 ? 'case' : 'cases'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {openSuite && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setOpenSuiteKey(undefined)}>
          <div
            role="dialog"
            aria-label={openSuite.name}
            className="flex h-full w-[520px] flex-col gap-4 overflow-y-auto bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="tp-heading text-lg">{openSuite.name}</h2>
              <button type="button" aria-label="Dismiss" onClick={() => setOpenSuiteKey(undefined)}>
                ✕
              </button>
            </div>

            <SuiteCaseGrid
              cases={gridCases}
              selected={editSelected}
              onToggle={toggleEdit}
              commitLabel="Save changes"
              commitDisabled={editSelected.size === editBaseline.size && Array.from(editSelected).every((id) => editBaseline.has(id))}
              onCommit={() => void handleSaveEdit()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
