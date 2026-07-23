import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { StatusBadge } from '@/components/StatusBadge'
import { PropertyRow } from '@/components/PropertyRow'
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
type Verdict = components['schemas']['Verdict']
type Result = components['schemas']['Result']
type Project = components['schemas']['Project']

export default function RunPage() {
  const { runKey } = useParams<{ runKey: string }>()
  const [run, setRun] = useState<Run>()
  const [notFound, setNotFound] = useState(false)
  const [project, setProject] = useState<Project>()
  const [items, setItems] = useState<RunItem[]>([])
  const [summary, setSummary] = useState<RunSummary>()
  const [selected, setSelected] = useState<RunItem>()
  const [results, setResults] = useState<Result[]>([])
  const [actorOverride, setActorOverride] = useState('')
  const [showActorOverride, setShowActorOverride] = useState(false)
  const [comment, setComment] = useState('')
  const [lifecycleError, setLifecycleError] = useState<string>()

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

  useEffect(() => {
    if (!run) return
    api
      .GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey: run.projectKey } } })
      .then(({ data }) => setProject(data))
      .catch(() => setProject(undefined))
  }, [run])

  useEffect(() => {
    void load()
  }, [load])

  // refreshSelected re-fetches the run's items and the given item's result
  // log from the server and updates state from that response — never from
  // component-local closures, which can be stale across awaits.
  const refreshSelected = useCallback(
    async (itemId: string) => {
      if (!runKey) return
      const [{ data: i }, { data: s }, { data: r }] = await Promise.all([
        api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey } } }),
        api.GET('/api/v1/runs/{runKey}/summary', { params: { path: { runKey } } }),
        api.GET('/api/v1/items/{itemId}/results', { params: { path: { itemId } } }),
      ])
      setItems(i ?? [])
      setSummary(s)
      setResults(r ?? [])
      setSelected((i ?? []).find((it) => it.id === itemId))
    },
    [runKey],
  )

  async function selectItem(item: RunItem) {
    setSelected(item)
    await refreshSelected(item.id)
  }

  async function recordVerdict(verdict: Verdict) {
    if (!selected) return
    const override = actorOverride.trim()
    await api.POST('/api/v1/items/{itemId}/results', {
      params: { path: { itemId: selected.id } },
      body: { verdict, comment, ...(override ? { actor: override } : {}) },
    })
    setComment('')
    await refreshSelected(selected.id)
  }

  async function markRetest() {
    if (!selected) return
    await api.PUT('/api/v1/items/{itemId}/status', {
      params: { path: { itemId: selected.id } },
      body: { status: 'retest' },
    })
    await refreshSelected(selected.id)
  }

  async function closeRun() {
    if (!runKey) return
    setLifecycleError(undefined)
    const { error } = await api.POST('/api/v1/runs/{runKey}/close', { params: { path: { runKey } } })
    if (error) {
      setLifecycleError('Could not close this run.')
      return
    }
    await load()
  }

  async function reopenRun() {
    if (!runKey) return
    setLifecycleError(undefined)
    const { error } = await api.POST('/api/v1/runs/{runKey}/reopen', { params: { path: { runKey } } })
    if (error) {
      setLifecycleError("You don't have permission to reopen this run — ask a project admin.")
      return
    }
    await load()
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.4fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="tp-heading">{run?.name ?? 'Run'}</CardTitle>
            {run && (
              <div className="flex items-center gap-2">
                <Badge variant={run.status === 'open' ? 'secondary' : 'outline'}>{run.status}</Badge>
                {run.status === 'open' ? (
                  <Button size="sm" variant="outline" onClick={() => void closeRun()}>
                    Close run
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => void reopenRun()}>
                    Reopen
                  </Button>
                )}
              </div>
            )}
          </div>
          {lifecycleError && <p className="text-sm text-destructive">{lifecycleError}</p>}
          {summary && (
            <p className="text-sm text-muted-foreground">
              {summary.total} items — {Object.entries(summary.counts)
                .map(([status, count]) => `${count} ${status}`)
                .join(', ')}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void selectItem(item)}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span>
                    {item.content.title}
                    {item.newerVersion && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (newer version available)
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

      {selected && (
        <Card data-testid="item-detail">
          <CardHeader>
            <CardTitle className="tp-heading">{selected.content.title}</CardTitle>
            <PropertyRow label="Pinned version" value={`v${selected.caseVersion}`} />
            {selected.newerVersion && (
              <p className="text-sm text-muted-foreground">A newer version of this case exists</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="mb-1 text-sm font-medium">Steps</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {selected.content.steps?.map((step, i) => (
                  <li key={i}>
                    {step.action}
                    {step.expected && (
                      <span className="text-muted-foreground"> → {step.expected}</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
            {selected.content.expectedResult && (
              <div>
                <h3 className="mb-1 text-sm font-medium">Expected result</h3>
                <p className="text-sm">{selected.content.expectedResult}</p>
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              {run?.status === 'closed' && (
                <p className="text-sm text-muted-foreground">
                  This run is closed. Ask a project admin to reopen it to record new results.
                </p>
              )}
              <div className="space-y-1">
                <Label htmlFor="comment">Comment</Label>
                <Textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={run?.status === 'closed'}
                />
              </div>
              <div className="space-y-1">
                {showActorOverride ? (
                  <>
                    <Label htmlFor="actor-override">Record on behalf of</Label>
                    <Input
                      id="actor-override"
                      value={actorOverride}
                      onChange={(e) => setActorOverride(e.target.value)}
                      disabled={run?.status === 'closed'}
                      placeholder="Defaults to you"
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => setShowActorOverride(true)}
                    disabled={run?.status === 'closed'}
                  >
                    Record on behalf of someone else
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={run?.status === 'closed'} onClick={() => void recordVerdict('pass')}>
                  Pass
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={run?.status === 'closed'}
                  onClick={() => void recordVerdict('failed')}
                >
                  Failed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={run?.status === 'closed'}
                  onClick={() => void recordVerdict('blocked')}
                >
                  Blocked
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={run?.status === 'closed'}
                  onClick={() => void recordVerdict('skipped')}
                >
                  Skipped
                </Button>
                {selected.currentStatus === 'failed' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={run?.status === 'closed'}
                    onClick={() => void markRetest()}
                  >
                    Retest
                  </Button>
                )}
              </div>
            </div>

            {results.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="mb-1 text-sm font-medium">History</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {results.map((r) => (
                    <li key={r.id}>
                      {r.actor}: {r.verdict}
                      {r.comment && ` — ${r.comment}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}
