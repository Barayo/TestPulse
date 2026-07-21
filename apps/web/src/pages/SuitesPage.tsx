import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { SuiteDrawer } from '@/components/SuiteDrawer'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']

export default function SuitesPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const location = useLocation()
  const bumpLanding = useBumpDataRevision()
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [cases, setCases] = useState<TestCase[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [suiteName, setSuiteName] = useState('')
  const [openSuiteKey, setOpenSuiteKey] = useState<string | undefined>(
    location.hash.startsWith('#suite-') ? location.hash.slice('#suite-'.length) : undefined,
  )

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

  async function handleCreateSuite(e: FormEvent) {
    e.preventDefault()
    if (!projectKey || !suiteName.trim()) return
    await api.POST('/api/v1/projects/{projectKey}/suites', {
      params: { path: { projectKey } },
      body: { name: suiteName },
    })
    setSuiteName('')
    await load()
    bumpLanding()
  }

  async function addCaseToSuite(suiteKey: string, caseKey: string) {
    await api.PUT('/api/v1/suites/{suiteKey}/cases/{caseKey}', { params: { path: { suiteKey, caseKey } } })
    await load()
    bumpLanding()
  }

  async function removeCaseFromSuite(suiteKey: string, caseKey: string) {
    await api.DELETE('/api/v1/suites/{suiteKey}/cases/{caseKey}', { params: { path: { suiteKey, caseKey } } })
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

  const openSuite = suites.find((s) => s.key === openSuiteKey)

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
        <CardContent>
          <form onSubmit={handleCreateSuite} className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="suite-name">Suite name</Label>
              <Input
                id="suite-name"
                value={suiteName}
                onChange={(e) => setSuiteName(e.target.value)}
                placeholder="Smoke"
              />
            </div>
            <Button type="submit">Create suite</Button>
          </form>
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
            <ul className="divide-y rounded-md border text-sm">
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
        <SuiteDrawer
          open
          suiteName={openSuite.name}
          memberCases={openSuite.caseIds.map((id) => {
            const c = cases.find((x) => x.id === id)
            return { id: c?.key ?? id, title: c?.content.title ?? id }
          })}
          availableCases={cases.map((c) => ({ id: c.key, title: c.content.title }))}
          onClose={() => setOpenSuiteKey(undefined)}
          onAddCase={(caseKey) => void addCaseToSuite(openSuite.key, caseKey)}
          onRemoveCase={(caseKey) => void removeCaseFromSuite(openSuite.key, caseKey)}
        />
      )}
    </div>
  )
}
