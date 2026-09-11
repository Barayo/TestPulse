import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ClockIcon, Loader2Icon } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/useAuth'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { StepGroupsCard } from '@/components/StepGroupsCard'
import { ReleasesSettingsCard } from '@/components/ReleasesSettingsCard'
import { RequirementsSettingsCard } from '@/components/RequirementsSettingsCard'

// Project-level settings (enable-public-project-access) — currently just
// the "Public access" toggle. Gated on manageProject (broader than
// Tenant-Admin-only, matching the permission PATCH /projects/{projectKey}
// already requires server-side), following the same client-side
// self-gating idiom as RolesPage.tsx/InstanceSettingsPage.tsx.
export default function ProjectSettingsPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const { user: me } = useAuth()
  const permissions = useProjectPermissions(projectKey)
  const [projectId, setProjectId] = useState('')
  const [projectName, setProjectName] = useState('')
  const [publicAccess, setPublicAccess] = useState<boolean>()
  const [publicProjectsEnabled, setPublicProjectsEnabled] = useState<boolean>()
  const [assigneeRestrictedRecording, setAssigneeRestrictedRecording] = useState<boolean>()
  const [archived, setArchived] = useState<boolean>()
  const [autoArchiveExempt, setAutoArchiveExempt] = useState<boolean>()
  // Only a Tenant Admin can read the instance-wide threshold
  // (GET /api/v1/instance-settings is Tenant-Admin-only), so the exemption
  // control itself is Tenant-Admin-only too — a Project Admin sees nothing
  // here rather than a control we can't accurately describe (design.md D9).
  const [autoArchiveInactiveDays, setAutoArchiveInactiveDays] = useState<number>()
  const [copied, setCopied] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteCounts, setDeleteCounts] = useState<{ suiteCount: number; caseCount: number }>()

  useEffect(() => {
    if (!projectKey || !permissions?.manageProject) return
    void api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }).then(({ data }) => {
      if (data) {
        setProjectId(data.id)
        setProjectName(data.name)
        setPublicAccess(data.publicAccess)
        setArchived(data.archived)
        setAutoArchiveExempt(data.autoArchiveExempt)
        setAssigneeRestrictedRecording(data.assigneeRestrictedRecording)
      }
    })
    void api.GET('/api/v1/meta').then(({ data }) => {
      if (data) setPublicProjectsEnabled(data.publicProjectsEnabled)
    })
    if (me?.isTenantAdmin) {
      void api.GET('/api/v1/instance-settings').then(({ data }) => {
        if (data) setAutoArchiveInactiveDays(data.autoArchiveInactiveDays)
      })
    }
  }, [projectKey, permissions?.manageProject, me?.isTenantAdmin])

  if (permissions !== undefined && !permissions.manageProject) {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
  }

  async function toggle() {
    if (!projectKey || publicAccess === undefined) return
    const next = !publicAccess
    const { data } = await api.PATCH('/api/v1/projects/{projectKey}', {
      params: { path: { projectKey } },
      body: { publicAccess: next },
    })
    if (data) setPublicAccess(data.publicAccess)
  }

  async function toggleArchived() {
    if (!projectKey || archived === undefined) return
    const next = !archived
    const { data } = await api.PATCH('/api/v1/projects/{projectKey}', {
      params: { path: { projectKey } },
      body: { archived: next },
    })
    if (data) setArchived(data.archived)
  }

  async function toggleAutoArchiveExempt() {
    if (!projectKey || autoArchiveExempt === undefined) return
    const next = !autoArchiveExempt
    const { data } = await api.PATCH('/api/v1/projects/{projectKey}', {
      params: { path: { projectKey } },
      body: { autoArchiveExempt: next },
    })
    if (data) setAutoArchiveExempt(data.autoArchiveExempt)
  }

  async function toggleAssigneeRestrictedRecording() {
    if (!projectKey || assigneeRestrictedRecording === undefined) return
    const next = !assigneeRestrictedRecording
    const { data } = await api.PATCH('/api/v1/projects/{projectKey}', {
      params: { path: { projectKey } },
      body: { assigneeRestrictedRecording: next },
    })
    if (data) setAssigneeRestrictedRecording(data.assigneeRestrictedRecording)
  }

  async function openDeleteDialog() {
    setDeleteDialogOpen(true)
    setDeleteCounts(undefined)
    const { data } = await api.GET('/api/v1/projects/summaries')
    const summary = data?.find((s) => s.projectId === projectId)
    if (summary) setDeleteCounts({ suiteCount: summary.suiteCount, caseCount: summary.caseCount })
  }

  async function confirmDelete() {
    if (!projectKey) return
    await api.DELETE('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
    setDeleteDialogOpen(false)
    navigate('/')
  }

  // The project's own unified URL (unify-authenticated-and-public-views) —
  // the same page a signed-in member sees, read-only for anyone else.
  const publicUrl = projectKey ? `${window.location.origin}/projects/${projectKey}` : ''

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Settings' }]} />

      {projectKey && <StepGroupsCard projectKey={projectKey} />}
      {projectKey && <CustomFieldsCard projectKey={projectKey} />}
      {projectKey && <ReleasesSettingsCard projectKey={projectKey} />}
      {projectKey && <RequirementsSettingsCard projectKey={projectKey} />}

      <Card>
        <CardHeader>
          <CardTitle>Public access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Anyone with this link can view the project&apos;s cases, runs, and results without an account. Nothing
            can be created, edited, or run by an anonymous visitor.
          </p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Public access</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{publicAccess ? 'On' : 'Off'}</span>
              <Switch
                aria-label="Public access"
                checked={publicAccess ?? false}
                disabled={publicAccess === undefined || publicProjectsEnabled === false}
                onCheckedChange={() => void toggle()}
              />
            </div>
          </div>
          {publicProjectsEnabled === false && (
            <p className="text-xs text-muted-foreground">
              Public project access is turned off for this instance. Ask a Tenant Admin to enable it under
              Administration → Instance.
            </p>
          )}
          {publicAccess && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="flex-1 truncate font-mono text-xs">{publicUrl}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(publicUrl)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restrict recording to assignee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            When on, only a run item&apos;s assignee (or a project admin) can record a result or change its status.
            Unassigned items are unaffected.
          </p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Restrict recording to assignee</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{assigneeRestrictedRecording ? 'On' : 'Off'}</span>
              <Switch
                aria-label="Restrict recording to assignee"
                checked={assigneeRestrictedRecording ?? false}
                disabled={assigneeRestrictedRecording === undefined}
                onCheckedChange={() => void toggleAssigneeRestrictedRecording()}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Archive project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Archiving hides the project from the default project list. It stays reversible — nothing is deleted,
            and unarchiving restores it to active at any time.
          </p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Archive project</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{archived ? 'Archived' : 'Active'}</span>
              <Switch
                aria-label="Archive project"
                checked={archived ?? false}
                disabled={archived === undefined}
                onCheckedChange={() => void toggleArchived()}
              />
            </div>
          </div>
          {me?.isTenantAdmin && autoArchiveInactiveDays !== undefined && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {autoArchiveInactiveDays === 0
                  ? 'A Tenant Admin can turn on an instance-wide policy, under Administration → Instance, that automatically archives a project once it goes quiet for a set number of days. That policy is currently off, so no project is archived automatically right now.'
                  : `A Tenant Admin has turned on an instance-wide policy, under Administration → Instance, that automatically archives any project after ${autoArchiveInactiveDays} days with no new runs, case edits, or suites.`}
              </p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-sm font-medium">Exempt this project</span>
                  <p className="text-xs text-muted-foreground">
                    {autoArchiveExempt
                      ? 'On — this project will never be archived automatically, no matter how long it goes without activity. It can still be archived manually at any time.'
                      : 'Off — this project follows the instance-wide policy above like any other project.'}
                  </p>
                </div>
                <Switch
                  aria-label="Auto-archive exemption"
                  checked={autoArchiveExempt ?? false}
                  disabled={autoArchiveExempt === undefined}
                  onCheckedChange={() => void toggleAutoArchiveExempt()}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {archived && permissions?.projectDelete && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Delete project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Permanently removes this project and everything inside it — cases, suites, runs, and results. This
              cannot be undone.
            </p>
            <Button type="button" variant="destructive" onClick={() => void openDeleteDialog()}>
              Delete project
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete &quot;{projectName}&quot;?</DialogTitle>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This permanently removes{' '}
              {deleteCounts === undefined ? (
                <Loader2Icon className="inline size-3 animate-spin align-[-2px]" aria-hidden="true" />
              ) : (
                <>
                  {deleteCounts.suiteCount} suite{deleteCounts.suiteCount === 1 ? '' : 's'} and{' '}
                  {deleteCounts.caseCount} case{deleteCounts.caseCount === 1 ? '' : 's'}
                </>
              )}
              , along with every run and result recorded against them. This cannot be undone.
            </p>
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5">
              <ClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Deletion runs in the background and may take a few minutes for large projects. The project
                disappears from every list immediately.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteCounts === undefined} onClick={() => void confirmDelete()}>
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
