import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Run = components['schemas']['Run']
type Project = components['schemas']['Project']

export default function RunsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const bumpLanding = useBumpDataRevision()
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [cases, setCases] = useState<TestCase[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [runName, setRunName] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!projectId) return
    setNotFound(false)
    try {
      const [{ data: p }, { data: c }, { data: r }] = await Promise.all([
        api.GET('/api/v1/projects/{projectId}', { params: { path: { projectId } } }),
        api.GET('/api/v1/projects/{projectId}/cases', { params: { path: { projectId } } }),
        api.GET('/api/v1/projects/{projectId}/runs', { params: { path: { projectId } } }),
      ])
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      setCases(c ?? [])
      setRuns(r ?? [])
    } catch {
      setCases([])
      setRuns([])
    } finally {
      setLoaded(true)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreateRun(e: FormEvent) {
    e.preventDefault()
    if (!projectId || !runName.trim() || !loaded) return
    await api.POST('/api/v1/projects/{projectId}/runs', {
      params: { path: { projectId } },
      body: { name: runName, caseIds: cases.map((c) => c.id) },
    })
    setRunName('')
    await load()
    bumpLanding()
  }

  if (!projectId) return null
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
          { label: project?.name ?? '', href: `/projects/${projectId}` },
          { label: 'Runs' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">New run (includes all current cases)</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRun} className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="run-name">Name</Label>
              <Input
                id="run-name"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder="Sprint 1"
              />
            </div>
            <Button type="submit" disabled={!loaded}>
              Create run
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {runs.map((r) => (
                <li key={r.id}>
                  <Link to={`/runs/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
