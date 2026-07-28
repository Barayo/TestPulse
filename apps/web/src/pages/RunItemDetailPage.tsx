import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '@/lib/api'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PropertyRow } from '@/components/PropertyRow'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { CaseStepsList } from '@/components/CaseStepsList'
import { StatusBadge } from '@/components/StatusBadge'
import { timeAgo } from '@/lib/timeAgo'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type RunItem = components['schemas']['RunItem']
type Verdict = components['schemas']['Verdict']
type Result = components['schemas']['Result']
type Project = components['schemas']['Project']

function isValidDate(iso: string): boolean {
  return iso !== '' && !Number.isNaN(new Date(iso).getTime())
}

export default function RunItemDetailPage() {
  const { runKey, caseKey } = useParams<{ runKey: string; caseKey: string }>()

  const [run, setRun] = useState<Run>()
  const [project, setProject] = useState<Project>()
  const [item, setItem] = useState<RunItem>()
  const [results, setResults] = useState<Result[]>([])
  const [notFound, setNotFound] = useState(false)

  const [actorOverride, setActorOverride] = useState('')
  const [showActorOverride, setShowActorOverride] = useState(false)
  const [comment, setComment] = useState('')

  const load = useCallback(async () => {
    if (!runKey || !caseKey) return
    setNotFound(false)
    const [{ data: r }, { data: items }] = await Promise.all([
      api.GET('/api/v1/runs/{runKey}', { params: { path: { runKey } } }),
      api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey } } }),
    ])
    const match = (items ?? []).find((it) => it.caseKey === caseKey)
    if (!r || !match) {
      setNotFound(true)
      return
    }
    setRun(r)
    setItem(match)
    const { data: res } = await api.GET('/api/v1/items/{itemId}/results', { params: { path: { itemId: match.id } } })
    setResults(res ?? [])
  }, [runKey, caseKey])

  useEffect(() => {
    void load()
  }, [load])

  const projectKey = run?.projectKey
  useEffect(() => {
    if (!projectKey) return
    api
      .GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
      .then(({ data }) => setProject(data))
      .catch(() => setProject(undefined))
  }, [projectKey])

  async function recordVerdict(verdict: Verdict) {
    if (!item) return
    const override = actorOverride.trim()
    await api.POST('/api/v1/items/{itemId}/results', {
      params: { path: { itemId: item.id } },
      body: { verdict, comment, ...(override ? { actor: override } : {}) },
    })
    setComment('')
    const [{ data: items }, { data: res }] = await Promise.all([
      api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey: runKey! } } }),
      api.GET('/api/v1/items/{itemId}/results', { params: { path: { itemId: item.id } } }),
    ])
    setItem((items ?? []).find((it) => it.id === item.id))
    setResults(res ?? [])
  }

  async function markRetest() {
    if (!item) return
    await api.PUT('/api/v1/items/{itemId}/status', {
      params: { path: { itemId: item.id } },
      body: { status: 'retest' },
    })
    const { data: items } = await api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey: runKey! } } })
    setItem((items ?? []).find((it) => it.id === item.id))
  }

  if (!runKey || !caseKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Item not found. <Link to={`/runs/${runKey}`} className="underline">Go to run</Link>
      </p>
    )
  }
  if (!run || !item) return null

  const isClosed = run.status === 'closed'

  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb([
    { label: 'Projects', href: '/' },
    { label: project?.name ?? '', href: project ? `/projects/${project.key}` : undefined },
    { label: run.name, href: `/runs/${runKey}` },
  ])

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/runs/${runKey}`}
            aria-label={`Back to ${run.name}`}
            className="text-2xl leading-none text-primary hover:text-primary/70"
          >
            ←
          </Link>
          <h1 className="tp-heading text-2xl">{item.content.title}</h1>
        </div>
        <StatusBadge status={item.currentStatus} />
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="panel-title text-xs font-semibold tracking-wide text-muted-foreground uppercase">Steps</p>
            <CaseStepsList steps={item.content.steps} />
          </div>
          {item.content.expectedResult && (
            <div>
              <h3 className="mb-1 text-sm font-medium">Expected result</h3>
              <p className="text-sm">{item.content.expectedResult}</p>
            </div>
          )}

          <div className="space-y-2 border-t pt-4">
            {isClosed ? (
              <p className="text-sm text-muted-foreground">
                This run is closed. Ask a project admin to reopen it to record new results.
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="comment">Comment</Label>
                  <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                </div>
                <div className="space-y-1">
                  {showActorOverride ? (
                    <>
                      <Label htmlFor="actor-override">Record on behalf of</Label>
                      <Input
                        id="actor-override"
                        value={actorOverride}
                        onChange={(e) => setActorOverride(e.target.value)}
                        placeholder="Defaults to you"
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => setShowActorOverride(true)}
                    >
                      Record on behalf of someone else
                    </button>
                  )}
                </div>
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
                  {item.currentStatus === 'failed' && (
                    <Button size="sm" variant="secondary" onClick={() => void markRetest()}>
                      Retest
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div
          className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5"
          data-testid="run-item-sidebar"
        >
          <CaseSidebarSection title="Properties">
            <PropertyRow label="Status" value={<StatusBadge status={item.currentStatus} />} />
            {item.testName && <PropertyRow label="Test name" value={item.testName} />}
            <PropertyRow label="Platform" value={item.content.platform} />
            <PropertyRow label="Tags" value={(item.content.tags ?? []).join(', ')} />
            <PropertyRow label="Pinned version" value={`v${item.caseVersion}`} />
            {item.newerVersion && (
              <p className="text-sm text-muted-foreground">A newer version of this case exists</p>
            )}
          </CaseSidebarSection>

          <CaseSidebarSection title="History">
            {results.length > 0 ? (
              <ul className="space-y-2 text-sm" aria-label="Result history">
                {results.map((r) => (
                  <li key={r.id} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.verdict} />
                      {isValidDate(r.createdAt) && (
                        <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {r.actor}
                      {r.comment && ` — ${r.comment}`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No results recorded yet.</p>
            )}
          </CaseSidebarSection>
        </div>
      </div>
    </div>
  )
}
