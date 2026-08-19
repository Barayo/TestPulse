import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { RunSection } from '@/components/RunList'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjectPermissions, useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type Project = components['schemas']['Project']

export default function RunsPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
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
              <RunSection
                title="Open"
                variant="secondary"
                runs={open}
                emptyMessage={`No open runs — everything's closed out. Start one with the "+ New run" button above.`}
                projectKey={projectKey}
              />
              <RunSection
                title="Closed"
                variant="outline"
                runs={closed}
                emptyMessage="No closed runs yet — runs land here once they're closed."
                recessed
                projectKey={projectKey}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
