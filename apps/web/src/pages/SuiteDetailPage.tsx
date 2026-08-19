import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '@/lib/api'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SuiteCaseGrid, type SuiteCaseGridCase } from '@/components/SuiteCaseGrid'
import { SuiteActionsMenu } from '@/components/SuiteActionsMenu'
import { SuitePassRateTrend, type TrendPoint } from '@/components/SuitePassRateTrend'
import { RunRow } from '@/components/RunList'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { PropertyRow } from '@/components/PropertyRow'
import { HealthBar } from '@/components/HealthBar'
import { Badge } from '@/components/ui/badge'
import { ConfirmBanner } from '@/components/ConfirmBanner'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { useProjectPermissions, useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import { timeAgo } from '@/lib/timeAgo'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']
type Folder = components['schemas']['Folder']
type SuiteTrendPoint = components['schemas']['SuiteTrendPoint']
type Run = components['schemas']['Run']

function toGridCase(c: TestCase): SuiteCaseGridCase {
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

// Maps each of the two independent data sources SuiteDetailPage already
// fetches into one normalized shape — SuitePassRateTrend itself doesn't know
// or care which one it's rendering (rework-suite-run-flow design.md D7).
function closedPoint(p: SuiteTrendPoint): TrendPoint {
  const rate = p.total === 0 ? 0 : Math.round(((p.counts.pass ?? 0) / p.total) * 100)
  const date = new Date(p.createdAt).toLocaleDateString()
  return {
    runKey: p.runKey,
    runName: p.runName,
    createdAt: p.createdAt,
    rate,
    isOpen: false,
    detail: `${p.runName} · ${date} · ${rate}% (${p.counts.pass ?? 0}/${p.total} pass)`,
  }
}

function runPoint(r: Run): TrendPoint {
  const rate = r.passRate ?? 0
  const date = new Date(r.createdAt).toLocaleDateString()
  const isOpen = r.status === 'open'
  return {
    runKey: r.key,
    runName: r.name,
    createdAt: r.createdAt,
    rate,
    isOpen,
    detail: isOpen ? `${r.name} · ${date} · ${rate}% so far (in progress)` : `${r.name} · ${date} · ${rate}%`,
  }
}

export default function SuiteDetailPage() {
  const { projectKey, suiteKey } = useParams<{ projectKey: string; suiteKey: string }>()
  const navigate = useNavigate()
  const bumpLanding = useBumpDataRevision()
  const permissions = useProjectPermissions(projectKey)
  const { user, loading: authLoading } = useAuth()
  const access = useProjectReadAccess(projectKey, user, authLoading)

  const [project, setProject] = useState<Project>()
  const [suite, setSuite] = useState<Suite>()
  const [cases, setCases] = useState<TestCase[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [notFound, setNotFound] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [baseline, setBaseline] = useState<Set<string>>(new Set())
  const [createdRun, setCreatedRun] = useState<{ key: string; name: string }>()
  const [isEditing, setIsEditing] = useState(false)
  const [trendPoints, setTrendPoints] = useState<SuiteTrendPoint[]>([])
  const [suiteRuns, setSuiteRuns] = useState<Run[]>([])
  const [stabilityView, setStabilityView] = useState<'closed' | 'all'>('closed')

  const load = useCallback(async () => {
    // Waits for the session check (and, per design.md D11, for confirmed
    // project read access) to resolve before firing either branch —
    // otherwise an authenticated member deep-linking here would transiently
    // fetch the public endpoint during that window and could see a false
    // "not found" before auth resolves (design.md D2). A signed-in
    // non-member resolves to 'public' here (D11), not `!authLoading` alone,
    // so they read a public project exactly like an anonymous visitor
    // instead of hitting 403s.
    if (!projectKey || !suiteKey || access === 'loading') return
    setNotFound(false)
    const [{ data: p }, { data: c }, { data: f }, { data: s }, { data: t }, { data: r }] = access === 'member'
      ? await Promise.all([
          api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
          api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey } } }),
          api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey } } }),
          api.GET('/api/v1/suites/{suiteKey}', { params: { path: { suiteKey } } }),
          api.GET('/api/v1/suites/{suiteKey}/trend', { params: { path: { suiteKey } } }),
          api.GET('/api/v1/projects/{projectKey}/runs', { params: { path: { projectKey } } }),
        ])
      : await Promise.all([
          api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }),
          api.GET('/api/v1/public/projects/{projectKey}/cases', { params: { path: { projectKey } } }),
          api.GET('/api/v1/public/projects/{projectKey}/folders', { params: { path: { projectKey } } }),
          api.GET('/api/v1/public/suites/{suiteKey}', { params: { path: { suiteKey } } }),
          api.GET('/api/v1/public/suites/{suiteKey}/trend', { params: { path: { suiteKey } } }),
          api.GET('/api/v1/public/projects/{projectKey}/runs', { params: { path: { projectKey } } }),
        ])
    if (!p || !s) {
      setNotFound(true)
      return
    }
    setProject(p)
    setCases(c ?? [])
    setFolders(f ?? [])
    setSuite(s)
    setTrendPoints(t?.points ?? [])
    setSuiteRuns((r ?? []).filter((run) => run.suiteKey === s.key))
  }, [projectKey, suiteKey, access])

  useEffect(() => {
    void load()
  }, [load])

  const gridCases = cases.map(toGridCase)

  // A suite's caseIds are the case's db id; the grid keys everything by case
  // key. An id with no matching case (soft-deleted) has no key to key it by
  // and no row to render — kept as the raw db id so it stays in the set,
  // untouched, and never generates a spurious remove call.
  useEffect(() => {
    if (!suite) return
    const asKeys = new Set(suite.caseIds.map((id) => cases.find((c) => c.id === id)?.key ?? id))
    setSelected(asKeys)
    setBaseline(asKeys)
    // A reload (e.g. after saving membership) always returns to view mode —
    // matching CaseDetailPage.tsx's own isEditing-resets-on-reload pattern.
    setIsEditing(false)
  }, [suite, cases])

  function toggle(caseKey: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(caseKey)) next.delete(caseKey)
      else next.add(caseKey)
      return next
    })
  }

  function exitEditing() {
    // Discards any uncommitted checkbox changes — the picker's `selected`
    // state otherwise persists across an edit session on its own.
    setSelected(baseline)
    setIsEditing(false)
  }

  async function handleSaveEdit() {
    if (!suite) return
    const added = Array.from(selected).filter((id) => !baseline.has(id))
    const removed = Array.from(baseline).filter((id) => !selected.has(id))
    await Promise.all([
      ...added.map((caseKey) =>
        api.PUT('/api/v1/suites/{suiteKey}/cases/{caseKey}', { params: { path: { suiteKey: suite.key, caseKey } } }),
      ),
      ...removed.map((caseKey) =>
        api.DELETE('/api/v1/suites/{suiteKey}/cases/{caseKey}', { params: { path: { suiteKey: suite.key, caseKey } } }),
      ),
    ])
    await load()
    bumpLanding()
  }

  if (!projectKey || !suiteKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Suite not found. <Link to={`/projects/${projectKey}/suites`} className="underline">Go to Suites</Link>
        {!user && !authLoading && (
          <>
            {' '}
            ·{' '}
            <Link to="/login" state={{ from: `/projects/${projectKey}/suites/${suiteKey}` }} className="underline">
              Log in
            </Link>
          </>
        )}
      </p>
    )
  }
  if (!project || !suite) return null

  const isDirty = selected.size !== baseline.size || Array.from(selected).some((id) => !baseline.has(id))
  const canEditMembership = Boolean(permissions?.suiteEditMembership)

  // Lifted out of SuitePassRateTrend (design.md D11) — "latest closed run"
  // is one fact about the suite, not something that should appear to change
  // depending on which Stability view is currently selected, so it's
  // computed once here from the full run list rather than per view.
  const closedRuns = suiteRuns.filter((r) => r.status === 'closed')
  const latestClosedRun = closedRuns.length
    ? [...closedRuns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : undefined
  const trailingOpenCount = suiteRuns.filter(
    (r) => r.status === 'open' && (!latestClosedRun || new Date(r.createdAt).getTime() > new Date(latestClosedRun.createdAt).getTime()),
  ).length

  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb(
    [
      { label: 'Projects', href: '/' },
      { label: project.name, href: `/projects/${projectKey}` },
      { label: 'Suites', href: `/projects/${projectKey}/suites` },
      { label: suite.name },
    ],
    suite.name,
  )

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      {createdRun && (
        <ConfirmBanner
          message={`Run "${createdRun.name}" created.`}
          linkTo={`/runs/${createdRun.key}`}
          linkLabel="View it →"
          onDismiss={() => setCreatedRun(undefined)}
        />
      )}

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <h1 className="tp-heading text-2xl">{suite.name}</h1>
        {!isEditing && (
          <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
            {canEditMembership ? 'Edit cases' : 'View cases'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        {isEditing ? (
          <SuiteCaseGrid
            cases={gridCases}
            folders={folders}
            selected={selected}
            onToggle={toggle}
            commitLabel="Save changes"
            commitDisabled={!isDirty}
            onCommit={() => void handleSaveEdit()}
            onExit={exitEditing}
            readOnly={!canEditMembership}
          />
        ) : (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="tp-heading text-lg">Stability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-0.5 border-b pb-3" data-testid="suite-latest-closed-run">
                  <PropertyRow
                    label="Latest closed run"
                    value={
                      latestClosedRun ? (
                        <span className="flex items-center gap-2">
                          <HealthBar rate={latestClosedRun.passRate ?? 0} />
                          <span className="text-xs text-muted-foreground">{timeAgo(latestClosedRun.createdAt)}</span>
                        </span>
                      ) : undefined
                    }
                  />
                  {trailingOpenCount > 0 && (
                    <PropertyRow
                      label="In progress"
                      value={<Badge variant="secondary">{trailingOpenCount} run{trailingOpenCount === 1 ? '' : 's'}</Badge>}
                    />
                  )}
                </div>
                <div role="group" aria-label="Stability view" className="flex w-fit gap-0.5 rounded-full bg-muted p-1">
                  {(['closed', 'all'] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      aria-pressed={stabilityView === view}
                      onClick={() => setStabilityView(view)}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                        stabilityView === view ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {view === 'closed' ? 'Closed runs' : 'Open + closed'}
                    </button>
                  ))}
                </div>
                {stabilityView === 'closed' ? (
                  <>
                    <SuitePassRateTrend
                      points={trendPoints.map(closedPoint)}
                      emptyMessage="No closed runs yet — close a run created from this suite to see its trend here."
                    />
                    <p className="text-xs text-muted-foreground">
                      Only closed runs — an in-progress run has no final verdict yet.
                    </p>
                  </>
                ) : (
                  <>
                    <SuitePassRateTrend
                      points={[...suiteRuns]
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                        .map(runPoint)}
                      emptyMessage="No runs yet — run this suite to see its trend here."
                    />
                    <p className="text-xs text-muted-foreground">
                      Every run, open or closed. The open run's rate counts only what's been
                      recorded so far against its full case list — it will keep moving.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="tp-heading text-lg">Run history</CardTitle>
                {suiteRuns.filter((r) => r.status === 'closed').length >= 2 && (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link to={`/projects/${projectKey}/runs/compare`}>Compare runs</Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {suiteRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No runs yet — run this suite to see its history here.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {suiteRuns.map((r) => (
                      <li key={r.id}>
                        <RunRow run={r} projectKey={projectKey} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div
          className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5"
          data-testid="suite-sidebar"
        >
          <CaseSidebarSection title="Properties">
            <PropertyRow label="Cases" value={suite.caseIds.length} />
            <PropertyRow
              label="Pass rate"
              value={suite.passRate === null ? 'Never run' : <HealthBar rate={suite.passRate} />}
            />
            <PropertyRow label="Created" value={suite.createdAt ? new Date(suite.createdAt).toLocaleDateString() : undefined} />
          </CaseSidebarSection>

          <CaseSidebarSection title="Actions">
            <SuiteActionsMenu
              suite={suite}
              projectKey={projectKey}
              variant="buttons"
              navigate={navigate}
              onChanged={load}
              onRunCreated={setCreatedRun}
              permissions={permissions}
            />
          </CaseSidebarSection>
        </div>
      </div>
    </div>
  )
}
