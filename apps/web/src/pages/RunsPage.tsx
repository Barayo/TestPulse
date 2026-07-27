import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type Project = components['schemas']['Project']

export default function RunsPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])

  const load = useCallback(async () => {
    if (!projectKey) return
    setNotFound(false)
    try {
      const [{ data: p }, { data: r }] = await Promise.all([
        api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
        api.GET('/api/v1/projects/{projectKey}/runs', { params: { path: { projectKey } } }),
      ])
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      setRuns(r ?? [])
    } catch {
      setRuns([])
    }
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

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
          { label: 'Runs' },
        ]}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="tp-heading">Runs</CardTitle>
          <Button type="button" asChild>
            <Link to={`/projects/${projectKey}/runs/new`}>+ New run</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {runs.map((r) => (
                <li key={r.id}>
                  <Link to={`/runs/${r.key}`} className="hover:underline">
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
