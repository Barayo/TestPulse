import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ClipboardListIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { PropertyRow } from '@/components/PropertyRow'
import { StatusPill, ProgressBar, HealthBar, healthColor } from '@/components/HealthBar'
import { ReleaseStatusBadge } from '@/components/ReleaseStatusBadge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type Release = components['schemas']['Release']
type ReleaseStatus = components['schemas']['ReleaseStatus']
type TestPlan = components['schemas']['TestPlan']
type Project = components['schemas']['Project']
type RequirementCoverage = components['schemas']['RequirementCoverage']

// Reuses the exact status-tint tokens StatusPill's pillClasses already
// registers (bg-status-*-bg/fg) rather than misusing StatusPill itself,
// which is rate-based (0-100) — coverage is a 3-state categorical status,
// not a percentage (add-requirements-traceability design.md D6 deviation).
const COVERAGE_PILL: Record<RequirementCoverage['status'], { label: string; className: string }> = {
  covered: { label: 'Covered', className: 'bg-status-healthy-bg text-status-healthy-fg' },
  failing: { label: 'Failing', className: 'bg-status-risk-bg text-status-risk-fg' },
  notRun: { label: 'Not run', className: 'bg-status-neutral-bg text-status-neutral-fg' },
}

function CoverageStatusPill({ status }: { status: RequirementCoverage['status'] }) {
  const { label, className } = COVERAGE_PILL[status]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${className}`}>{label}</span>
}

// Normalized (never undefined) — the generated Rollup schema types passRate
// as optional since it isn't in `required`, even though the API always
// returns it; this is the shape every call site actually wants to work with.
type RollupRow = { runCount: number; passRate: number | null }

type PlanRow = TestPlan & { rollup: RollupRow }

function TestPlanCard({ plan, projectKey, releaseKey }: { plan: PlanRow; projectKey: string; releaseKey: string }) {
  const rate = plan.rollup.passRate
  return (
    <li className="relative">
      <Link
        to={`/projects/${projectKey}/releases/${releaseKey}/plans/${plan.key}`}
        className="relative flex flex-col gap-2.5 overflow-hidden rounded-xl border bg-card p-4 pl-5 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-md"
      >
        <span
          className={`absolute inset-y-0 left-0 w-1 ${rate === null ? 'bg-border' : healthColor(rate)}`}
          aria-hidden="true"
        />
        <span className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ClipboardListIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate font-medium">{plan.name}</span>
        </span>
        <span className="tp-label">{plan.key}</span>
        <StatusPill rate={rate} />
        <ProgressBar rate={rate} />
        <span className="text-xs text-muted-foreground">
          {plan.rollup.runCount} run{plan.rollup.runCount === 1 ? '' : 's'}
        </span>
      </Link>
    </li>
  )
}

export default function ReleaseDetailPage() {
  const { projectKey, releaseKey } = useParams<{ projectKey: string; releaseKey: string }>()
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)
  const [project, setProject] = useState<Project>()
  const [release, setRelease] = useState<Release>()
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [rollup, setRollup] = useState<RollupRow>()
  const [coverage, setCoverage] = useState<RequirementCoverage[]>()
  const [creatingPlan, setCreatingPlan] = useState(false)
  const [planName, setPlanName] = useState('')
  const [planDescription, setPlanDescription] = useState('')
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState<ReleaseStatus>('active')
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!projectKey || !releaseKey) return
    const [{ data: p }, { data: rel }] = await Promise.all([
      api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
      api.GET('/api/v1/releases/{releaseKey}', { params: { path: { releaseKey } } }),
    ])
    setProject(p)
    setRelease(rel)
    const [{ data: planList }, { data: releaseRollup }, { data: coverageRows }] = await Promise.all([
      api.GET('/api/v1/releases/{releaseKey}/plans', { params: { path: { releaseKey } } }),
      api.GET('/api/v1/releases/{releaseKey}/rollup', { params: { path: { releaseKey } } }),
      api.GET('/api/v1/releases/{releaseKey}/requirements-coverage', { params: { path: { releaseKey } } }),
    ])
    setRollup({ runCount: releaseRollup?.runCount ?? 0, passRate: releaseRollup?.passRate ?? null })
    setCoverage(coverageRows ?? [])
    const rows = await Promise.all(
      (planList ?? []).map(async (plan) => {
        const { data: planRollup } = await api.GET('/api/v1/plans/{planKey}/rollup', { params: { path: { planKey: plan.key } } })
        const normalizedRollup: RollupRow = { runCount: planRollup?.runCount ?? 0, passRate: planRollup?.passRate ?? null }
        return { ...plan, rollup: normalizedRollup }
      }),
    )
    setPlans(rows)
  }, [projectKey, releaseKey])

  useEffect(() => {
    void load()
  }, [load])

  function openEdit() {
    if (!release) return
    setEditName(release.name)
    setEditDescription(release.description)
    setEditStatus(release.status)
    setEditing(true)
  }

  async function handleSaveEdit() {
    if (!releaseKey || !editName.trim()) return
    await api.PUT('/api/v1/releases/{releaseKey}', {
      params: { path: { releaseKey } },
      body: { name: editName.trim(), description: editDescription.trim(), status: editStatus },
    })
    setEditing(false)
    await load()
  }

  async function handleCreatePlan() {
    if (!releaseKey || !planName.trim()) return
    await api.POST('/api/v1/releases/{releaseKey}/plans', {
      params: { path: { releaseKey } },
      body: { name: planName.trim(), description: planDescription.trim() },
    })
    setCreatingPlan(false)
    setPlanName('')
    setPlanDescription('')
    await load()
  }

  async function handleDelete() {
    if (!releaseKey || !projectKey) return
    await api.DELETE('/api/v1/releases/{releaseKey}', { params: { path: { releaseKey } } })
    setDeleting(false)
    navigate(`/projects/${projectKey}/releases`)
  }

  if (!projectKey || !releaseKey) return null
  if (!project || !release) return null

  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb(
    [
      { label: 'Projects', href: '/' },
      { label: project.name, href: `/projects/${projectKey}` },
      { label: 'Releases', href: `/projects/${projectKey}/releases` },
      { label: release.name },
    ],
    release.name,
  )

  const canManage = Boolean(permissions?.manageProject)

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-2">
          <h1 className="tp-heading text-2xl">{release.name}</h1>
          <ReleaseStatusBadge status={release.status} />
        </div>
        {canManage && (
          <Button type="button" variant="outline" onClick={openEdit}>
            Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        <div className="space-y-7">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="tp-heading text-lg">Test Plans</CardTitle>
              {canManage && (
                <Button type="button" variant="outline" onClick={() => setCreatingPlan(true)}>
                  + New test plan
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">No test plans yet.</p>
              ) : (
                <ul aria-label="Test plans" className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))' }}>
                  {plans.map((plan) => (
                    <TestPlanCard key={plan.id} plan={plan} projectKey={projectKey} releaseKey={releaseKey} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="tp-heading text-lg">Requirements Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              {!coverage || coverage.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No requirements in this project yet. Link cases to requirements to see coverage here.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1.5 font-normal">Requirement</th>
                      <th className="py-1.5 font-normal">Status</th>
                      <th className="py-1.5 text-right font-normal">Linked cases</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.map((row) => (
                      <tr key={row.requirementId} className="border-b last:border-b-0">
                        <td className="py-2">
                          <Link to={`/projects/${projectKey}/requirements/${row.requirementKey}`} className="hover:underline">
                            {row.name}
                          </Link>
                        </td>
                        <td className="py-2">
                          <CoverageStatusPill status={row.status} />
                        </td>
                        <td className="py-2 text-right">{row.caseCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5">
          <CaseSidebarSection title="Properties">
            <PropertyRow label="Key" value={release.key} />
            <PropertyRow label="Status" value={<ReleaseStatusBadge status={release.status} />} />
            <PropertyRow
              label="Pass rate"
              value={rollup && rollup.passRate !== null ? <HealthBar rate={rollup.passRate} /> : 'No runs yet'}
            />
            <PropertyRow label="Runs" value={rollup?.runCount ?? 0} />
            <PropertyRow label="Created" value={new Date(release.createdAt).toLocaleDateString()} />
          </CaseSidebarSection>

          {canManage && (
            <CaseSidebarSection title="Actions">
              <div className="flex flex-col gap-1.5">
                <Button type="button" variant="outline" className="justify-start" onClick={() => setCreatingPlan(true)}>
                  + New test plan
                </Button>
                <Button type="button" variant="outline" className="justify-start" onClick={openEdit}>
                  Edit release
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="justify-start"
                  disabled={plans.length > 0}
                  title={plans.length > 0 ? `Delete its ${plans.length} test plan${plans.length === 1 ? '' : 's'} first` : undefined}
                  onClick={() => setDeleting(true)}
                >
                  Delete release
                </Button>
              </div>
            </CaseSidebarSection>
          )}
        </div>
      </div>

      <Dialog open={creatingPlan} onOpenChange={setCreatingPlan}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>New test plan</DialogTitle>
          <DialogDescription>
            Scoped to <span className="font-medium text-foreground">{release.name}</span> — a Test Plan&apos;s Release
            can&apos;t change later.
          </DialogDescription>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="plan-name">Name</Label>
              <Input id="plan-name" autoFocus value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Android" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-description">Description</Label>
              <Textarea
                id="plan-description"
                value={planDescription}
                onChange={(e) => setPlanDescription(e.target.value)}
                placeholder="What this plan covers…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingPlan(false)}>
              Cancel
            </Button>
            <Button disabled={!planName.trim()} onClick={() => void handleCreatePlan()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Edit release</DialogTitle>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-release-name">Name</Label>
              <Input id="edit-release-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-release-description">Description</Label>
              <Textarea id="edit-release-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-release-status">Status</Label>
              <select
                id="edit-release-status"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as ReleaseStatus)}
              >
                <option value="active">Active</option>
                <option value="maintained">Maintained</option>
                <option value="eol">EOL</option>
              </select>
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
          <DialogTitle>Delete release?</DialogTitle>
          <DialogDescription>
            Delete &ldquo;{release.name}&rdquo;? This cannot be undone.
          </DialogDescription>
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
