import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, type NavigateFunction } from 'react-router'
import { LayersIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { StatusPill, ProgressBar, healthColor } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'
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
//
// A background fill, not `statusBorderClass` (a `border-l-*` color class
// with no accompanying border-width utility, so it paints nothing) — found
// live while verifying this card locally.
function accentSpineClass(rate: number | null): string {
  return rate === null ? 'bg-border' : healthColor(rate)
}

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
      <div className="relative overflow-hidden rounded-xl border bg-card transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-md">
        <span className={`absolute inset-y-0 left-0 w-1 ${accentSpineClass(suite.passRate)}`} aria-hidden="true" />
        <button
          type="button"
          className="flex w-full flex-col gap-2.5 p-4 pl-5 pr-9 text-left"
          onClick={() => navigate(`/projects/${projectKey}/suites/${suite.key}`)}
        >
          <span className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <LayersIcon className="size-4" aria-hidden="true" />
            </span>
            <span className="truncate font-medium">{suite.name}</span>
          </span>
          {suite.passRate === null ? (
            <span className="text-xs text-muted-foreground">Never run</span>
          ) : (
            <>
              <StatusPill rate={suite.passRate} />
              <ProgressBar rate={suite.passRate} />
            </>
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
  const [suitesCursor, setSuitesCursor] = useState<string | null>(null)
  const [loadingMoreSuites, setLoadingMoreSuites] = useState(false)
  const [creating, setCreating] = useState(false)
  const [suiteName, setSuiteName] = useState('')
  const [createdRun, setCreatedRun] = useState<{ key: string; name: string }>()

  const fetchSuitesPage = useCallback(
    (cursor?: string) =>
      (access === 'member'
        ? api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey: projectKey! }, query: { cursor } } })
        : api.GET('/api/v1/public/projects/{projectKey}/suites', { params: { path: { projectKey: projectKey! }, query: { cursor } } })
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
      const [{ data: p }, suitesPage] = access === 'member'
        ? await Promise.all([
            api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
            fetchSuitesPage(),
          ])
        : await Promise.all([
            api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }),
            fetchSuitesPage(),
          ])
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      setSuites(suitesPage.items)
      setSuitesCursor(suitesPage.nextCursor)
    } catch {
      setSuites([])
    }
  }, [projectKey, access, fetchSuitesPage])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMoreSuites() {
    if (!suitesCursor) return
    setLoadingMoreSuites(true)
    try {
      const page = await fetchSuitesPage(suitesCursor)
      setSuites((prev) => [...prev, ...page.items])
      setSuitesCursor(page.nextCursor)
    } finally {
      setLoadingMoreSuites(false)
    }
  }

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

      <div className="flex items-center justify-between">
        <h1 className="tp-heading text-2xl">Suites</h1>
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
      </div>

      {suites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No suites yet.</p>
      ) : (
        <ul
          aria-label="Suites"
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))' }}
        >
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
      <LoadMoreButton hasMore={!!suitesCursor} loading={loadingMoreSuites} onClick={() => void loadMoreSuites()} />

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
