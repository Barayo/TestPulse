import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { OpenRunsTriage, ClosedRunsLedger } from '@/components/RunsListTriage'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { PropertyRow } from '@/components/PropertyRow'
import { HealthBar } from '@/components/HealthBar'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type TestPlan = components['schemas']['TestPlan']
type Release = components['schemas']['Release']
type Run = components['schemas']['Run']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']

// Normalized (never undefined) — the generated Rollup schema types passRate
// as optional since it isn't in `required`, even though the API always
// returns it; this is the shape every call site actually wants to work with.
type RollupRow = { runCount: number; passRate: number | null }

export default function TestPlanDetailPage() {
  const { projectKey, releaseKey, planKey } = useParams<{ projectKey: string; releaseKey: string; planKey: string }>()
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)
  const [project, setProject] = useState<Project>()
  const [release, setRelease] = useState<Release>()
  const [plan, setPlan] = useState<TestPlan>()
  const [runs, setRuns] = useState<Run[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [rollup, setRollup] = useState<RollupRow>()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!projectKey || !planKey) return
    const [{ data: p }, { data: pl }, s] = await Promise.all([
      api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
      api.GET('/api/v1/plans/{planKey}', { params: { path: { planKey } } }),
      fetchAllPages((cursor) =>
        api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
      ),
    ])
    setProject(p)
    setPlan(pl)
    setSuites(s.items)
    if (pl) {
      const { data: rel } = await api.GET('/api/v1/releases/{releaseKey}', { params: { path: { releaseKey: pl.releaseKey } } })
      setRelease(rel)
    }
    const [{ data: r }, { data: roll }] = await Promise.all([
      api.GET('/api/v1/plans/{planKey}/runs', { params: { path: { planKey } } }),
      api.GET('/api/v1/plans/{planKey}/rollup', { params: { path: { planKey } } }),
    ])
    setRuns(r ?? [])
    setRollup({ runCount: roll?.runCount ?? 0, passRate: roll?.passRate ?? null })
  }, [projectKey, planKey])

  useEffect(() => {
    void load()
  }, [load])

  function openEdit() {
    if (!plan) return
    setEditName(plan.name)
    setEditDescription(plan.description)
    setEditing(true)
  }

  async function handleSaveEdit() {
    if (!planKey || !editName.trim()) return
    await api.PUT('/api/v1/plans/{planKey}', {
      params: { path: { planKey } },
      body: { name: editName.trim(), description: editDescription.trim() },
    })
    setEditing(false)
    await load()
  }

  async function handleDelete() {
    if (!planKey || !projectKey || !releaseKey) return
    await api.DELETE('/api/v1/plans/{planKey}', { params: { path: { planKey } } })
    setDeleting(false)
    navigate(`/projects/${projectKey}/releases/${releaseKey}`)
  }

  function goToNewRun() {
    if (!projectKey || !plan) return
    navigate(`/projects/${projectKey}/runs/new`, {
      state: { seedFromTestPlanKey: plan.key, seedName: `${plan.name} run` },
    })
  }

  if (!projectKey || !releaseKey || !planKey) return null
  if (!project || !plan) return null

  const open = runs.filter((r) => r.status === 'open')
  const closed = runs.filter((r) => r.status === 'closed')
  const canManage = Boolean(permissions?.manageProject)

  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb(
    [
      { label: 'Projects', href: '/' },
      { label: project.name, href: `/projects/${projectKey}` },
      { label: 'Releases', href: `/projects/${projectKey}/releases` },
      { label: release?.name ?? '', href: `/projects/${projectKey}/releases/${releaseKey}` },
      { label: plan.name },
    ],
    plan.name,
  )

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <h1 className="tp-heading text-2xl">{plan.name}</h1>
        {canManage && (
          <Button type="button" variant="outline" onClick={openEdit}>
            Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="tp-heading text-lg">Runs</CardTitle>
            <Button type="button" onClick={goToNewRun}>
              + New run
            </Button>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <Badge variant="secondary">Open</Badge>
                    <span className="text-xs text-muted-foreground">{open.length}</span>
                  </div>
                  {open.length > 0 && <OpenRunsTriage runs={open} />}
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <Badge variant="outline">Closed</Badge>
                    <span className="text-xs text-muted-foreground">{closed.length}</span>
                  </div>
                  {closed.length > 0 && <ClosedRunsLedger runs={closed} suites={suites} projectKey={projectKey} />}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5">
          <CaseSidebarSection title="Properties">
            <PropertyRow label="Key" value={plan.key} />
            <PropertyRow
              label="Release"
              value={
                release ? (
                  <Link to={`/projects/${projectKey}/releases/${releaseKey}`} className="text-primary hover:underline">
                    {release.name}
                  </Link>
                ) : undefined
              }
            />
            <PropertyRow
              label="Pass rate"
              value={rollup && rollup.passRate !== null ? <HealthBar rate={rollup.passRate} /> : 'No runs yet'}
            />
            <PropertyRow label="Runs" value={rollup?.runCount ?? 0} />
            <PropertyRow label="Created" value={new Date(plan.createdAt).toLocaleDateString()} />
          </CaseSidebarSection>

          {canManage && (
            <CaseSidebarSection title="Actions">
              <div className="flex flex-col gap-1.5">
                <Button type="button" className="justify-start" onClick={goToNewRun}>
                  + New run
                </Button>
                <Button type="button" variant="outline" className="justify-start" onClick={openEdit}>
                  Edit test plan
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="justify-start"
                  disabled={runs.length > 0}
                  title={runs.length > 0 ? `Has ${runs.length} run${runs.length === 1 ? '' : 's'} — remove them first` : undefined}
                  onClick={() => setDeleting(true)}
                >
                  Delete test plan
                </Button>
              </div>
            </CaseSidebarSection>
          )}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Edit test plan</DialogTitle>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-plan-name">Name</Label>
              <Input id="edit-plan-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-plan-description">Description</Label>
              <Textarea id="edit-plan-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button disabled={!editName.trim()} onClick={() => void handleSaveEdit()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete test plan?</DialogTitle>
          <p className="text-sm text-muted-foreground">Delete &ldquo;{plan.name}&rdquo;? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              Confirm delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
