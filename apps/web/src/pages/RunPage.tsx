import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { StatusBadge } from '@/components/StatusBadge'
import { RunStatusBreakdown } from '@/components/RunStatusBreakdown'
import { useBumpDataRevision } from '@/lib/DataRevision'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type RunItem = components['schemas']['RunItem']
type RunSummary = components['schemas']['RunSummary']
type Project = components['schemas']['Project']

export default function RunPage() {
  const { runKey } = useParams<{ runKey: string }>()
  const navigate = useNavigate()
  const [run, setRun] = useState<Run>()
  const [notFound, setNotFound] = useState(false)
  const [project, setProject] = useState<Project>()
  const [items, setItems] = useState<RunItem[]>([])
  const [summary, setSummary] = useState<RunSummary>()
  const [lifecycleError, setLifecycleError] = useState<string>()
  const [isClosing, setIsClosing] = useState(false)
  const [isReopening, setIsReopening] = useState(false)
  const bumpDataRevision = useBumpDataRevision()

  const load = useCallback(async () => {
    if (!runKey) return
    setNotFound(false)
    try {
      const [{ data: r }, { data: i }, { data: s }] = await Promise.all([
        api.GET('/api/v1/runs/{runKey}', { params: { path: { runKey } } }),
        api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey } } }),
        api.GET('/api/v1/runs/{runKey}/summary', { params: { path: { runKey } } }),
      ])
      if (!r) {
        setNotFound(true)
        return
      }
      setRun(r)
      setItems(i ?? [])
      setSummary(s)
    } catch {
      setItems([])
    }
  }, [runKey])

  const projectKey = run?.projectKey
  useEffect(() => {
    if (!projectKey) return
    api
      .GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
      .then(({ data }) => setProject(data))
      .catch(() => setProject(undefined))
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  async function closeRun() {
    if (!runKey) return
    setLifecycleError(undefined)
    setIsClosing(true)
    const { error } = await api.POST('/api/v1/runs/{runKey}/close', { params: { path: { runKey } } })
    setIsClosing(false)
    if (error) {
      setLifecycleError('Could not close this run.')
      return
    }
    setRun((r) => (r ? { ...r, status: 'closed' } : r))
    bumpDataRevision()
  }

  async function reopenRun() {
    if (!runKey) return
    setLifecycleError(undefined)
    setIsReopening(true)
    const { error } = await api.POST('/api/v1/runs/{runKey}/reopen', { params: { path: { runKey } } })
    setIsReopening(false)
    if (error) {
      setLifecycleError("You don't have permission to reopen this run — ask a project admin.")
      return
    }
    setRun((r) => (r ? { ...r, status: 'open' } : r))
    bumpDataRevision()
  }

  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Run not found. <Link to="/" className="underline">Go to Projects</Link>
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs
        segments={[
          { label: 'Projects', href: '/' },
          { label: project?.name ?? '', href: project ? `/projects/${project.key}` : undefined },
          { label: run?.name ?? '' },
        ]}
      />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="tp-heading">{run?.name ?? 'Run'}</CardTitle>
            {run && (
              <div className="flex items-center gap-2">
                <Badge variant={run.status === 'open' ? 'secondary' : 'outline'}>{run.status}</Badge>
                {run.status === 'open' ? (
                  <Button size="sm" variant="outline" disabled={isClosing} onClick={() => void closeRun()}>
                    {isClosing ? 'Closing…' : 'Close run'}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={isReopening} onClick={() => void reopenRun()}>
                    {isReopening ? 'Reopening…' : 'Reopen'}
                  </Button>
                )}
              </div>
            )}
          </div>
          {lifecycleError && <p className="text-sm text-destructive">{lifecycleError}</p>}
          {summary && <RunStatusBreakdown total={summary.total} counts={summary.counts} />}
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/runs/${runKey}/items/${item.caseKey}`)}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="flex flex-col gap-0.5">
                    <span>
                      {item.content.title}
                      {item.newerVersion && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (newer version available)
                        </span>
                      )}
                    </span>
                    {(item.testName || item.content.platform || item.content.tags?.length) && (
                      <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {item.testName && <span>{item.testName}</span>}
                        {item.content.platform && <span>{item.content.platform}</span>}
                        {item.content.tags?.map((tag) => <span key={tag}>{tag}</span>)}
                      </span>
                    )}
                  </span>
                  <StatusBadge status={item.currentStatus} />
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
