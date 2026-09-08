import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { Button } from '@/components/ui/button'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { OpenRunsTriage, ClosedRunsLedger } from '@/components/RunsListTriage'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjectPermissions, useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type Project = components['schemas']['Project']
type Suite = components['schemas']['Suite']

export default function RunsPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)
  const { user, loading: authLoading } = useAuth()
  const access = useProjectReadAccess(projectKey, user, authLoading)
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const [runsCursor, setRunsCursor] = useState<string | null>(null)
  const [loadingMoreRuns, setLoadingMoreRuns] = useState(false)
  const [suites, setSuites] = useState<Suite[]>([])

  const fetchRunsPage = useCallback(
    (cursor?: string) =>
      (access === 'member'
        ? api.GET('/api/v1/projects/{projectKey}/runs', { params: { path: { projectKey: projectKey! }, query: { cursor } } })
        : api.GET('/api/v1/public/projects/{projectKey}/runs', { params: { path: { projectKey: projectKey! }, query: { cursor } } })
      ).then(({ data }) => data ?? { items: [], nextCursor: null }),
    [projectKey, access],
  )

  const load = useCallback(async () => {
    // Waits for the session check and confirmed project read access before
    // firing either branch (design.md D2/D11, unify-authenticated-and-public-views)
    // — a signed-in non-member resolves to 'public' here, reading a public
    // project like an anonymous visitor instead of hitting 403s.
    if (!projectKey || access === 'loading') return
    setNotFound(false)
    try {
      // Suites are fetched alongside runs (the complete set — a reference
      // lookup, not its own paginated display) to resolve each closed
      // run's suiteKey to a real name/link for clustering
      // (redesign-runs-list-triage-view design.md D3) — a run's suiteKey
      // survives its suite being deleted, so this list won't always cover
      // every key seen on a run; that's an expected, handled case, not an
      // error.
      const [{ data: p }, runsPage, s] = access === 'member'
        ? await Promise.all([
            api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
            fetchRunsPage(),
            fetchAllPages((cursor) =>
              api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
          ])
        : await Promise.all([
            api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }),
            fetchRunsPage(),
            fetchAllPages((cursor) =>
              api.GET('/api/v1/public/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
          ])
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      setRuns(runsPage.items)
      setRunsCursor(runsPage.nextCursor)
      setSuites(s.items)
    } catch {
      setRuns([])
    }
  }, [projectKey, access, fetchRunsPage])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMoreRuns() {
    if (!runsCursor) return
    setLoadingMoreRuns(true)
    try {
      const page = await fetchRunsPage(runsCursor)
      setRuns((prev) => [...prev, ...page.items])
      setRunsCursor(page.nextCursor)
    } finally {
      setLoadingMoreRuns(false)
    }
  }

  if (!projectKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Project not found. <Link to="/" className="underline">Go to Projects</Link>
        {!user && !authLoading && (
          <>
            {' '}
            ·{' '}
            <Link to="/login" state={{ from: `/projects/${projectKey}/runs` }} className="underline">
              Log in
            </Link>
          </>
        )}
      </p>
    )
  }

  const open = runs.filter((r) => r.status === 'open')
  const closed = runs.filter((r) => r.status === 'closed')

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={trimProjectBreadcrumb(
          [
            { label: 'Projects', href: '/' },
            { label: project?.name ?? '', href: `/projects/${projectKey}` },
            { label: 'Runs' },
          ],
          'Runs',
        )}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="tp-heading">Runs</CardTitle>
          <div className="flex items-center gap-2">
            {closed.length >= 2 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/projects/${projectKey}/runs/compare`)}
              >
                Compare runs
              </Button>
            )}
            {permissions?.runCreate && (
              <Button type="button" asChild>
                <Link to={`/projects/${projectKey}/runs/new`}>+ New run</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center">
              <p className="mb-1 text-sm font-medium">No runs yet</p>
              <p className="mb-4 text-sm text-muted-foreground">
                Runs track execution of your cases. Start one from a suite, or build one from scratch.
              </p>
              {permissions?.runCreate && (
                <Button asChild>
                  <Link to={`/projects/${projectKey}/runs/new`}>+ New run</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Badge variant="secondary">Open</Badge>
                  <span className="text-xs text-muted-foreground">{open.length}</span>
                </div>
                {open.length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">
                    No open runs — everything&apos;s closed out. Start one with the &quot;+ New run&quot; button above.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 px-1 text-xs text-muted-foreground italic">
                      Ordered by what needs attention first — lowest pass rate leads, not most recent.
                    </p>
                    <OpenRunsTriage runs={open} />
                  </>
                )}
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Badge variant="outline">Closed</Badge>
                  <span className="text-xs text-muted-foreground">{closed.length}</span>
                </div>
                {closed.length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">
                    No closed runs yet — runs land here once they&apos;re closed.
                  </p>
                ) : (
                  <ClosedRunsLedger runs={closed} suites={suites} projectKey={projectKey} />
                )}
              </div>
              {/* One fetch from GET /runs (newest-first, mixed) can land in
                  either bucket above, so the label stays generic rather
                  than scoped to "open"/"closed". */}
              <div className="border-t pt-4">
                <LoadMoreButton hasMore={!!runsCursor} loading={loadingMoreRuns} onClick={() => void loadMoreRuns()} label="Load more runs" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
