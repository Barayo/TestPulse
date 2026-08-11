import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { HealthBar } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjectPermissions, useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type Project = components['schemas']['Project']

// Closed can grow unbounded (CI dogfooding imports many automated runs on
// every push) — one shared cap/expand, not Closed-specific, so Open would
// be handled the same way if it ever ballooned too (group-runs-by-status).
const SECTION_CAP = 10

function RunRow({ run }: { run: Run }) {
  return (
    <Link
      to={`/runs/${run.key}`}
      aria-label={run.name}
      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
    >
      <span className="min-w-0 flex-1 truncate font-medium">{run.name}</span>
      <span className="w-20 shrink-0">
        {run.passRate === null || run.passRate === undefined ? (
          <span className="text-xs text-muted-foreground">not run yet</span>
        ) : (
          <HealthBar rate={run.passRate} />
        )}
      </span>
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{timeAgo(run.createdAt)}</span>
    </Link>
  )
}

function RunSection({
  title,
  variant,
  runs,
  emptyMessage,
  recessed,
}: {
  title: string
  variant: 'secondary' | 'outline'
  runs: Run[]
  emptyMessage: string
  recessed?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? runs : runs.slice(0, SECTION_CAP)
  const remaining = runs.length - visible.length

  return (
    <div className={recessed ? 'rounded-xl bg-muted/40 p-3' : ''}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Badge variant={variant}>{title}</Badge>
        <span className="text-xs text-muted-foreground">{runs.length}</span>
      </div>
      {runs.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-0.5">
          {visible.map((r) => (
            <li key={r.id}>
              <RunRow run={r} />
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
            Show {remaining} more {title.toLowerCase()} run{remaining === 1 ? '' : 's'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function RunsPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const permissions = useProjectPermissions(projectKey)
  const { user, loading: authLoading } = useAuth()
  const access = useProjectReadAccess(projectKey, user, authLoading)
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])

  const load = useCallback(async () => {
    // Waits for the session check and confirmed project read access before
    // firing either branch (design.md D2/D11, unify-authenticated-and-public-views)
    // — a signed-in non-member resolves to 'public' here, reading a public
    // project like an anonymous visitor instead of hitting 403s.
    if (!projectKey || access === 'loading') return
    setNotFound(false)
    try {
      const [{ data: p }, { data: r }] = access === 'member'
        ? await Promise.all([
            api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
            api.GET('/api/v1/projects/{projectKey}/runs', { params: { path: { projectKey } } }),
          ])
        : await Promise.all([
            api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }),
            api.GET('/api/v1/public/projects/{projectKey}/runs', { params: { path: { projectKey } } }),
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
  }, [projectKey, access])

  useEffect(() => {
    void load()
  }, [load])

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
          {permissions?.runCreate && (
            <Button type="button" asChild>
              <Link to={`/projects/${projectKey}/runs/new`}>+ New run</Link>
            </Button>
          )}
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
              <RunSection
                title="Open"
                variant="secondary"
                runs={open}
                emptyMessage={`No open runs — everything's closed out. Start one with the "+ New run" button above.`}
              />
              <RunSection
                title="Closed"
                variant="outline"
                runs={closed}
                emptyMessage="No closed runs yet — runs land here once they're closed."
                recessed
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
