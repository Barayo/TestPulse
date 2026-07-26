import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { HealthBar } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import type { components } from '@testpulse/shared/api'

type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']

export default function SuitesPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [suites, setSuites] = useState<Suite[]>([])
  const [creating, setCreating] = useState(false)
  const [suiteName, setSuiteName] = useState('')

  const load = useCallback(async () => {
    if (!projectKey) return
    setNotFound(false)
    try {
      const [{ data: p }, { data: s }] = await Promise.all([
        api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
        api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey } } }),
      ])
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      setSuites(s ?? [])
    } catch {
      setSuites([])
    }
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreateSuite() {
    if (!projectKey || !suiteName.trim()) return
    const { data: created } = await api.POST('/api/v1/projects/{projectKey}/suites', {
      params: { path: { projectKey } },
      body: { name: suiteName.trim() },
    })
    setCreating(false)
    setSuiteName('')
    if (created) navigate(`/projects/${projectKey}/suites/${created.key}`)
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="tp-heading">Suites</CardTitle>
          <Button
            type="button"
            onClick={() => {
              setSuiteName('')
              setCreating(true)
            }}
          >
            + New suite
          </Button>
        </CardHeader>
        <CardContent>
          {suites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suites yet.</p>
          ) : (
            <ul aria-label="Suites" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suites.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-2 rounded-lg border p-4 text-left hover:border-primary"
                    onClick={() => navigate(`/projects/${projectKey}/suites/${s.key}`)}
                  >
                    <span className="truncate font-medium">{s.name}</span>
                    {s.passRate === null ? (
                      <span className="text-xs text-muted-foreground">Never run</span>
                    ) : (
                      <HealthBar rate={s.passRate} />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {s.caseIds.length} {s.caseIds.length === 1 ? 'case' : 'cases'}
                      {s.lastRunAt && ` · ${timeAgo(s.lastRunAt)}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>New suite</DialogTitle>
          <div className="space-y-1">
            <Label htmlFor="suite-name">Suite name</Label>
            <Input
              id="suite-name"
              autoFocus
              value={suiteName}
              onChange={(e) => setSuiteName(e.target.value)}
              placeholder="Smoke"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && suiteName.trim()) void handleCreateSuite()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button disabled={!suiteName.trim()} onClick={() => void handleCreateSuite()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
