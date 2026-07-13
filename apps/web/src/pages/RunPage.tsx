import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { StatusBadge } from '@/components/StatusBadge'
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
  const { runId } = useParams<{ runId: string }>()
  const [run, setRun] = useState<Run>()
  const [project, setProject] = useState<Project>()
  const [items, setItems] = useState<RunItem[]>([])
  const [summary, setSummary] = useState<RunSummary>()
  const [selected, setSelected] = useState<RunItem>()
  const [results, setResults] = useState<Result[]>([])
  const [actor, setActor] = useState('')
  const [comment, setComment] = useState('')
  const [verdictError, setVerdictError] = useState<string>()

  const load = useCallback(async () => {
    if (!runId) return
    try {
      const [{ data: r }, { data: i }, { data: s }] = await Promise.all([
        api.GET('/api/v1/runs/{runId}', { params: { path: { runId } } }),
        api.GET('/api/v1/runs/{runId}/items', { params: { path: { runId } } }),
        api.GET('/api/v1/runs/{runId}/summary', { params: { path: { runId } } }),
      ])
      setRun(r)
      setItems(i ?? [])
      setSummary(s)
    } catch {
      setItems([])
    }
  }, [runId])

  useEffect(() => {
    if (!run) return
    api
      .GET('/api/v1/projects/{projectId}', { params: { path: { projectId: run.projectId } } })
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
      if (!runId) return
      const [{ data: i }, { data: s }, { data: r }] = await Promise.all([
        api.GET('/api/v1/runs/{runId}/items', { params: { path: { runId } } }),
        api.GET('/api/v1/runs/{runId}/summary', { params: { path: { runId } } }),
        api.GET('/api/v1/items/{itemId}/results', { params: { path: { itemId } } }),
      ])
      setItems(i ?? [])
      setSummary(s)
      setResults(r ?? [])
      setSelected((i ?? []).find((it) => it.id === itemId))
    },
    [runId],
  )

  async function selectItem(item: RunItem) {
    setSelected(item)
    setVerdictError(undefined)
    await refreshSelected(item.id)
  }

  async function recordVerdict(verdict: Verdict) {
    if (!selected) return
    if (!actor.trim()) {
      setVerdictError('your name is required')
      return
    }
    setVerdictError(undefined)
    await api.POST('/api/v1/items/{itemId}/results', {
      params: { path: { itemId: selected.id } },
      body: { actor, verdict, comment },
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

  return (
    <div className="space-y-4">
      <Breadcrumbs
        segments={[
          { label: 'Projects', href: '/' },
          { label: project?.name ?? '', href: project ? `/projects/${project.id}` : undefined },
          { label: run?.name ?? '' },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.4fr]">
      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">{run?.name ?? 'Run'}</CardTitle>
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
            <p className="text-sm text-muted-foreground">
              Pinned at v{selected.caseVersion}
              {selected.newerVersion && ' — a newer version of this case exists'}
            </p>
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
              <div className="space-y-1">
                <Label htmlFor="actor">Your name</Label>
                <Input id="actor" value={actor} onChange={(e) => setActor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="comment">Comment</Label>
                <Textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              {verdictError && <p className="text-sm text-destructive">{verdictError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void recordVerdict('pass')}>
                  Pass
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void recordVerdict('failed')}>
                  Failed
                </Button>
                <Button size="sm" variant="outline" onClick={() => void recordVerdict('blocked')}>
                  Blocked
                </Button>
                <Button size="sm" variant="outline" onClick={() => void recordVerdict('skipped')}>
                  Skipped
                </Button>
                {selected.currentStatus === 'failed' && (
                  <Button size="sm" variant="secondary" onClick={() => void markRetest()}>
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
