import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, type NavigateFunction } from 'react-router'
import { LayersIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { HealthBar } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { ConfirmBanner } from '@/components/ConfirmBanner'
import { SuiteActionsMenu, type SuiteActionsMenuHandle } from '@/components/SuiteActionsMenu'
import { useProjectPermissions, useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import type { components } from '@testpulse/shared/api'

type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']
type Permissions = components['schemas']['Permissions']

// A dedicated component (not inline in the .map() below) so each card owns
// its own ref to the menu it opens on right-click — a ref can't live inside
// a bare .map() callback (rules of hooks). Matches FolderRow/CaseRow/
// RunItemRow's identical precedent (add-suite-index-context-menu).
function SuiteCard({
  suite,
  projectKey,
  navigate,
  onChanged,
  onRunCreated,
  permissions,
}: {
  suite: Suite
  projectKey: string
  navigate: NavigateFunction
  onChanged: () => void | Promise<void>
  onRunCreated: (run: { key: string; name: string }) => void
  permissions: Permissions | undefined
}) {
  const menuRef = useRef<SuiteActionsMenuHandle>(null)

  return (
    <li
      className="relative"
      onContextMenu={(e) => {
        e.preventDefault()
        menuRef.current?.openAt(e.clientX, e.clientY)
      }}
    >
      <button
        type="button"
        className="flex w-full flex-col gap-2 rounded-lg border p-4 pr-9 text-left hover:border-primary"
        onClick={() => navigate(`/projects/${projectKey}/suites/${suite.key}`)}
      >
        <span className="flex items-center gap-1.5 truncate font-medium">
          <LayersIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {suite.name}
        </span>
        {suite.passRate === null ? (
          <span className="text-xs text-muted-foreground">Never run</span>
        ) : (
          <HealthBar rate={suite.passRate} />
        )}
        <span className="text-xs text-muted-foreground">
          {suite.caseIds.length} {suite.caseIds.length === 1 ? 'case' : 'cases'}
          {suite.lastRunAt && ` · ${timeAgo(suite.lastRunAt)}`}
        </span>
      </button>
      <div className="absolute top-3 right-2">
        <SuiteActionsMenu
          ref={menuRef}
          suite={suite}
          projectKey={projectKey}
          variant="menu"
          navigate={navigate}
          onChanged={onChanged}
          onRunCreated={onRunCreated}
          permissions={permissions}
        />
      </div>
    </li>
  )
}

export default function SuitesPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)
  const { user, loading: authLoading } = useAuth()
  const access = useProjectReadAccess(projectKey, user, authLoading)
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [suites, setSuites] = useState<Suite[]>([])
  const [creating, setCreating] = useState(false)
  const [suiteName, setSuiteName] = useState('')
  const [createdRun, setCreatedRun] = useState<{ key: string; name: string }>()

  const load = useCallback(async () => {
    // Waits for the session check and confirmed project read access before
    // firing either branch (design.md D2/D11, unify-authenticated-and-public-views)
    // — a signed-in non-member resolves to 'public' here, reading a public
    // project like an anonymous visitor instead of hitting 403s.
    if (!projectKey || access === 'loading') return
    setNotFound(false)
    try {
      const [{ data: p }, { data: s }] = access === 'member'
        ? await Promise.all([
            api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
            api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey } } }),
          ])
        : await Promise.all([
            api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }),
            api.GET('/api/v1/public/projects/{projectKey}/suites', { params: { path: { projectKey } } }),
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
  }, [projectKey, access])

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
        {!user && !authLoading && (
          <>
            {' '}
            ·{' '}
            <Link to="/login" state={{ from: `/projects/${projectKey}/suites` }} className="underline">
              Log in
            </Link>
          </>
        )}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={trimProjectBreadcrumb(
          [
            { label: 'Projects', href: '/' },
            { label: project?.name ?? '', href: `/projects/${projectKey}` },
            { label: 'Suites' },
          ],
          'Suites',
        )}
      />

      {createdRun && (
        <ConfirmBanner
          message={`Run "${createdRun.name}" created.`}
          linkTo={`/runs/${createdRun.key}`}
          linkLabel="View it →"
          onDismiss={() => setCreatedRun(undefined)}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="tp-heading">Suites</CardTitle>
          {permissions?.suiteCreate && (
            <Button
              type="button"
              onClick={() => {
                setSuiteName('')
                setCreating(true)
              }}
            >
              + New suite
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {suites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suites yet.</p>
          ) : (
            <ul aria-label="Suites" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suites.map((s) => (
                <SuiteCard
                  key={s.id}
                  suite={s}
                  projectKey={projectKey}
                  navigate={navigate}
                  onChanged={load}
                  onRunCreated={setCreatedRun}
                  permissions={permissions}
                />
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
