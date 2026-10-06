import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import { useNavigate, useParams } from 'react-router'
import { ClockIcon, Loader2Icon } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/useAuth'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Pill } from '@/components/ui/Pill'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { StepGroupsCard } from '@/components/StepGroupsCard'
import { ReleasesSettingsCard } from '@/components/ReleasesSettingsCard'
import { RequirementsSettingsCard } from '@/components/RequirementsSettingsCard'
import { WebhooksCard } from '@/components/WebhooksCard'
import type { components } from '@testpulse/shared/api'

type LandingView = components['schemas']['LandingView']

// Values here are i18next translation keys (not display text) — LandingView
// is used outside any component, so the actual t() lookup happens at render
// time in ProjectSettingsPage below.
const LANDING_VIEW_LABELS: Record<LandingView, ParseKeys> = {
  dashboard: 'ProjectSettingsPage.landingViewDashboard',
  library: 'ProjectSettingsPage.landingViewLibrary',
  suites: 'ProjectSettingsPage.landingViewSuites',
  runs: 'ProjectSettingsPage.landingViewRuns',
  reports: 'ProjectSettingsPage.landingViewReports',
}
const LANDING_VIEWS = Object.keys(LANDING_VIEW_LABELS) as LandingView[]

// Project-level settings (enable-public-project-access) — currently just
// the "Public access" toggle. Gated on manageProject (broader than
// Tenant-Admin-only, matching the permission PATCH /projects/{projectKey}
// already requires server-side), following the same client-side
// self-gating idiom as RolesPage.tsx/InstanceSettingsPage.tsx.
export default function ProjectSettingsPage() {
  const { t } = useTranslation()
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
  const [landingView, setLandingView] = useState<LandingView | null>()
  const [defaultLandingView, setDefaultLandingView] = useState<LandingView>()
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
        setLandingView((data.landingView as LandingView | null) ?? null)
      }
    })
    void api.GET('/api/v1/meta').then(({ data }) => {
      if (data) {
        setPublicProjectsEnabled(data.publicProjectsEnabled)
        setDefaultLandingView(data.defaultLandingView as LandingView)
      }
    })
    if (me?.isTenantAdmin) {
      void api.GET('/api/v1/instance-settings').then(({ data }) => {
        if (data) setAutoArchiveInactiveDays(data.autoArchiveInactiveDays)
      })
    }
  }, [projectKey, permissions?.manageProject, me?.isTenantAdmin])

  if (permissions !== undefined && !permissions.manageProject) {
    return <p className="text-sm text-muted-foreground">{t('ProjectSettingsPage.notAuthorized')}</p>
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

  async function selectLandingView(view: LandingView) {
    if (!projectKey) return
    const { data } = await api.PATCH('/api/v1/projects/{projectKey}', {
      params: { path: { projectKey } },
      body: { landingView: view },
    })
    if (data) setLandingView((data.landingView as LandingView | null) ?? null)
  }

  async function clearLandingViewOverride() {
    if (!projectKey) return
    const { data } = await api.PATCH('/api/v1/projects/{projectKey}', {
      params: { path: { projectKey } },
      body: { clearLandingView: true },
    })
    if (data) setLandingView((data.landingView as LandingView | null) ?? null)
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
      <Breadcrumbs segments={[{ label: t('ProjectSettingsPage.settingsBreadcrumb') }]} />

      {projectKey && <StepGroupsCard projectKey={projectKey} />}
      {projectKey && <CustomFieldsCard projectKey={projectKey} />}
      {projectKey && <ReleasesSettingsCard projectKey={projectKey} />}
      {projectKey && <RequirementsSettingsCard projectKey={projectKey} />}
      {projectKey && <WebhooksCard projectKey={projectKey} />}

      <Card>
        <CardHeader>
          <CardTitle>{t('ProjectSettingsPage.publicAccessTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('ProjectSettingsPage.publicAccessDescription')}
          </p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">{t('ProjectSettingsPage.publicAccessLabel')}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{publicAccess ? t('ProjectSettingsPage.on') : t('ProjectSettingsPage.off')}</span>
              <Switch
                aria-label={t('ProjectSettingsPage.publicAccessLabel')}
                checked={publicAccess ?? false}
                disabled={publicAccess === undefined || publicProjectsEnabled === false}
                onCheckedChange={() => void toggle()}
              />
            </div>
          </div>
          {publicProjectsEnabled === false && (
            <p className="text-xs text-muted-foreground">
              {t('ProjectSettingsPage.publicAccessDisabledInstanceWide')}
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
                {copied ? t('ProjectSettingsPage.copied') : t('ProjectSettingsPage.copy')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('ProjectSettingsPage.restrictRecordingTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('ProjectSettingsPage.restrictRecordingDescription')}
          </p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">{t('ProjectSettingsPage.restrictRecordingLabel')}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{assigneeRestrictedRecording ? t('ProjectSettingsPage.on') : t('ProjectSettingsPage.off')}</span>
              <Switch
                aria-label={t('ProjectSettingsPage.restrictRecordingLabel')}
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
          <CardTitle>{t('ProjectSettingsPage.landingViewTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('ProjectSettingsPage.landingViewDescription')}
          </p>
          <div role="group" aria-label={t('ProjectSettingsPage.landingViewTitle')} className="flex flex-wrap gap-2">
            <Pill active={landingView == null} onClick={() => void clearLandingViewOverride()}>
              {defaultLandingView
                ? t('ProjectSettingsPage.useInstanceDefaultWithCurrent', { current: t(LANDING_VIEW_LABELS[defaultLandingView]) })
                : t('ProjectSettingsPage.useInstanceDefault')}
            </Pill>
            {LANDING_VIEWS.map((view) => (
              <Pill key={view} active={landingView === view} onClick={() => void selectLandingView(view)}>
                {t(LANDING_VIEW_LABELS[view])}
              </Pill>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('ProjectSettingsPage.archiveProjectTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('ProjectSettingsPage.archiveProjectDescription')}
          </p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">{t('ProjectSettingsPage.archiveProjectTitle')}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{archived ? t('ProjectSettingsPage.archivedStatus') : t('ProjectSettingsPage.activeStatus')}</span>
              <Switch
                aria-label={t('ProjectSettingsPage.archiveProjectTitle')}
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
                  ? t('ProjectSettingsPage.autoArchivePolicyOff')
                  : t('ProjectSettingsPage.autoArchivePolicyOn', { days: autoArchiveInactiveDays })}
              </p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-sm font-medium">{t('ProjectSettingsPage.exemptThisProject')}</span>
                  <p className="text-xs text-muted-foreground">
                    {autoArchiveExempt
                      ? t('ProjectSettingsPage.autoArchiveExemptOn')
                      : t('ProjectSettingsPage.autoArchiveExemptOff')}
                  </p>
                </div>
                <Switch
                  aria-label={t('ProjectSettingsPage.autoArchiveExemptionAriaLabel')}
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
            <CardTitle>{t('ProjectSettingsPage.deleteProjectTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('ProjectSettingsPage.deleteProjectDescription')}
            </p>
            <Button type="button" variant="destructive" onClick={() => void openDeleteDialog()}>
              {t('ProjectSettingsPage.deleteProjectTitle')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('ProjectSettingsPage.deleteProjectDialogTitle', { name: projectName })}</DialogTitle>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('ProjectSettingsPage.deleteProjectPermanentlyRemovesPrefix')}{' '}
              {deleteCounts === undefined ? (
                <Loader2Icon className="inline size-3 animate-spin align-[-2px]" aria-hidden="true" />
              ) : (
                t('ProjectSettingsPage.deleteProjectSuiteCaseCounts', {
                  suiteCount: deleteCounts.suiteCount,
                  suitePlural: deleteCounts.suiteCount === 1 ? '' : 's',
                  caseCount: deleteCounts.caseCount,
                  casePlural: deleteCounts.caseCount === 1 ? '' : 's',
                })
              )}
              {t('ProjectSettingsPage.deleteProjectPermanentlyRemovesSuffix')}
            </p>
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5">
              <ClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {t('ProjectSettingsPage.deleteProjectBackgroundNote')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('ProjectSettingsPage.cancel')}
            </Button>
            <Button variant="destructive" disabled={deleteCounts === undefined} onClick={() => void confirmDelete()}>
              {t('ProjectSettingsPage.deleteProjectTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
