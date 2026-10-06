import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ChevronDown, FileTextIcon, LayersIcon, CirclePlayIcon, UsersIcon, SettingsIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { FoldersPanel, SuitesPanel, RunsPanel, ReportsPanel, ActivityPanel, ReleasesPanel, type LandingRelease } from '@/components/ProjectLandingPanels'
import { HealthRing, StatusPill } from '@/components/HealthBar'
import { useProjectLanding } from '@/lib/useProjectLanding'
import { useProjectReportsTeaser } from '@/lib/useProjectReportsTeaser'
import { useRunPassRateHistory } from '@/lib/useRunPassRateHistory'
import { useProjectActivity } from '@/lib/useProjectActivity'
import { useProjectSummaries, type ProjectSummary } from '@/lib/useProjectSummaries'
import { useProjectSwitcher } from '@/lib/useProjectSwitcher'
import { useProjectPermissions, useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import { timeAgo } from '@/lib/timeAgo'
import { SOURCE_LABEL, type Source } from './ImportProjectPage'
import type { components } from '@testpulse/shared/api'

type Project = components['schemas']['Project']
type ImportJob = components['schemas']['ImportJob']

function isValidDate(iso: string): boolean {
  return iso !== '' && !Number.isNaN(new Date(iso).getTime())
}

// Reuses the same icons as the panels this checklist stands in for
// (FoldersPanel/SuitesPanel/RunsPanel) so the two states read as the same
// page, not a different screen bolted on for the empty case.
function GettingStartedStep({
  icon,
  title,
  tip,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  tip: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40"
      onClick={onClick}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="text-sm text-muted-foreground">{tip}</span>
    </button>
  )
}

export default function ProjectPage() {
  const { t } = useTranslation()
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading, defaultLandingView } = useAuth()
  const permissions = useProjectPermissions(projectKey)
  const access = useProjectReadAccess(projectKey, user, authLoading)
  const { canSwitch, openSwitcher } = useProjectSwitcher()
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const landing = useProjectLanding(projectKey, access === 'member', access === 'loading')
  const reportsTeaser = useProjectReportsTeaser(projectKey, access === 'member', access === 'loading')
  const passRateHistory = useRunPassRateHistory(projectKey, access === 'member', access === 'loading')
  const activity = useProjectActivity(projectKey, access === 'member', access === 'loading')
  const summaries = useProjectSummaries()
  // No public equivalent exists for the batched /api/v1/projects/summaries
  // aggregate (unify-authenticated-and-public-views design.md D2), so a
  // non-member visitor's summary strip — anonymous, or signed-in but not a
  // project member (D11) — is derived from `landing` instead — which
  // already carries everything the strip needs (suite/case totals, the
  // most recent run and its pass rate) once its own dual-mode fetch has
  // settled.
  const anonymousSummary: ProjectSummary | undefined =
    access === 'public' && landing.loaded
      ? {
          id: projectKey ?? '',
          name: project?.name ?? '',
          description: project?.description ?? '',
          createdAt: project?.createdAt ?? '',
          isSample: project?.isSample ?? false,
          suiteCount: landing.totalSuites,
          caseCount: landing.totalCases,
          passRate: landing.runs[0]?.passRate ?? null,
          lastRunAt: landing.runs[0]?.createdAt ?? null,
          isFavorite: false,
          archived: project?.archived ?? false,
          tags: [],
        }
      : undefined
  const summary = access === 'member' ? summaries.find((s) => s.id === projectKey) : anonymousSummary

  const load = useCallback(async () => {
    // Waits for the session check and confirmed project read access before
    // firing either branch (design.md D2/D11) — a signed-in non-member
    // resolves to 'public' here, reading a public project like an
    // anonymous visitor instead of hitting 403s.
    if (!projectKey || access === 'loading') return
    setNotFound(false)
    try {
      const { data } = access === 'member'
        ? await api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
        : await api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } })
      if (data) setProject(data)
      else setNotFound(true)
    } catch {
      setProject(undefined)
    }
  }, [projectKey, access])

  useEffect(() => {
    void load()
  }, [load])

  // Releases have no public endpoint (introduce-release-test-plan) — only
  // fetched for a confirmed member, and the panel itself is never mounted
  // for a project with none (design.md: "doesn't exist yet" is invisible,
  // unlike Reports' always-rendered empty state).
  const [releases, setReleases] = useState<LandingRelease[]>([])
  useEffect(() => {
    if (!projectKey || access !== 'member') return
    let cancelled = false
    void (async () => {
      const { data: list } = await api.GET('/api/v1/projects/{projectKey}/releases', { params: { path: { projectKey } } })
      const rows = await Promise.all(
        (list ?? []).map(async (release) => {
          const [{ data: rollup }, { data: plans }] = await Promise.all([
            api.GET('/api/v1/releases/{releaseKey}/rollup', { params: { path: { releaseKey: release.key } } }),
            api.GET('/api/v1/releases/{releaseKey}/plans', { params: { path: { releaseKey: release.key } } }),
          ])
          return {
            key: release.key,
            name: release.name,
            status: release.status,
            passRate: rollup?.passRate ?? null,
            planCount: plans?.length ?? 0,
          }
        }),
      )
      if (!cancelled) setReleases(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [projectKey, access])

  // An empty project's Overview otherwise shows a generic getting-started
  // checklist with zero indication it came from an abandoned or failed
  // import wizard run (fix-import-wizard-orphaned-projects) — only worth
  // fetching once we already know the project is empty, and only for a
  // manageProject-permitted member (the endpoint's own permission
  // requirement; a member without it simply keeps the generic checklist).
  const [latestImportJob, setLatestImportJob] = useState<ImportJob>()
  useEffect(() => {
    if (!projectKey || access !== 'member' || !permissions?.manageProject) return
    if (!landing.loaded || landing.totalCases > 0 || landing.totalSuites > 0 || landing.totalRuns > 0) return
    let cancelled = false
    void (async () => {
      const { data } = await api.GET('/api/v1/projects/{projectKey}/import-jobs', { params: { path: { projectKey } } })
      if (!cancelled) setLatestImportJob(data?.[0])
    })()
    return () => {
      cancelled = true
    }
  }, [projectKey, access, permissions?.manageProject, landing.loaded, landing.totalCases, landing.totalSuites, landing.totalRuns])

  if (!projectKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('ProjectPage.notFoundMessage')} <Link to="/" className="underline">{t('ProjectPage.goToProjects')}</Link>
        {!user && !authLoading && (
          <>
            {' '}
            ·{' '}
            <Link to="/login" state={{ from: `/projects/${projectKey}` }} className="underline">
              {t('ProjectPage.logIn')}
            </Link>
          </>
        )}
      </p>
    )
  }

  // Effective landing view (add-configurable-project-landing design.md
  // D2/D4): the project's own override wins, else the instance-wide
  // default — both are already fetched by hooks above (the project itself,
  // and defaultLandingView from useAuth's shared /api/v1/meta fetch), so
  // no extra request is needed. "dashboard" renders this page's own
  // existing content unchanged below; every other value redirects
  // straight to that view's own real route rather than duplicating its
  // content here.
  const effectiveLandingView = (project?.landingView as string | null | undefined) ?? defaultLandingView
  if (project && effectiveLandingView !== 'dashboard') {
    return <Navigate to={`/projects/${projectKey}/${effectiveLandingView}`} replace />
  }

  // Only treat the project as genuinely empty once its landing data has
  // actually finished loading (not just "project is truthy") — landing
  // starts at its all-zero default, so gating on `project` alone flashed
  // the checklist the instant `project` resolved, for any project whose
  // landing fetch was still in flight, even one with plenty of content.
  // Until landing settles, the panels-with-empty-states view stays up
  // (same fallback the project-fetch-failure case below already relies on)
  // instead of flickering to the checklist and back.
  const isAllEmpty =
    Boolean(project) && landing.loaded && landing.totalCases === 0 && landing.totalSuites === 0 && landing.totalRuns === 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        {project && (
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="tp-heading text-2xl">{project.name}</h1>
              {project.archived && <Badge variant="outline">{t('ProjectPage.archivedBadge')}</Badge>}
              {canSwitch && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-primary"
                  onClick={openSwitcher}
                  title={t('ProjectPage.switchProjectTitle')}
                  aria-label={t('ProjectPage.switchProjectAriaLabel')}
                >
                  <ChevronDown className="size-5" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('ProjectPage.projectOverview', { key: project.key })}</p>
          </div>
        )}
        <div className="flex items-center gap-4">
          {user?.isTenantAdmin && (
            <Link
              to={`/projects/${projectKey}/members`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <UsersIcon className="size-4" aria-hidden="true" />
              {t('ProjectPage.membersLink')}
            </Link>
          )}
          {permissions?.manageProject && (
            <Link
              to={`/projects/${projectKey}/settings`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
              {t('ProjectPage.settingsLink')}
            </Link>
          )}
        </div>
      </div>

      {summary && (
        <div
          data-testid="summary-strip"
          className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 md:grid-cols-[minmax(200px,1.1fr)_auto_minmax(220px,1.3fr)_auto_minmax(160px,0.9fr)] md:items-center md:gap-5 md:px-5.5"
        >
          <div className="flex items-center gap-3">
            <HealthRing rate={summary.passRate} />
            <div className="flex flex-col gap-1">
              <StatusPill rate={summary.passRate} dot />
              <span className="text-xs text-muted-foreground">{t('ProjectPage.passRateAcrossSuites')}</span>
            </div>
          </div>

          <div className="hidden self-stretch border-l border-border md:block" aria-hidden="true" />

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="flex size-7.5 items-center justify-center rounded-md bg-accent text-primary">
                <LayersIcon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <div className="text-base leading-tight font-bold tabular-nums">{summary.suiteCount}</div>
                <div className="text-[11px] text-muted-foreground">{t('ProjectPage.suitesLabel')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex size-7.5 items-center justify-center rounded-md bg-accent text-primary">
                <FileTextIcon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <div className="text-base leading-tight font-bold tabular-nums">{summary.caseCount}</div>
                <div className="text-[11px] text-muted-foreground">{t('ProjectPage.casesLabel')}</div>
              </div>
            </div>
          </div>

          <div className="hidden self-stretch border-l border-border md:block" aria-hidden="true" />

          {summary.lastRunAt && isValidDate(summary.lastRunAt) ? (
            <div>
              <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{t('ProjectPage.lastRunLabel')}</div>
              <div className="text-sm font-bold tabular-nums">{timeAgo(summary.lastRunAt)}</div>
              {landing.runs[0] && (
                <div className="truncate text-xs text-muted-foreground">
                  {landing.runs[0].name}
                  {landing.runs[0].passRate !== null && ` · ${landing.runs[0].passRate}%`}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{t('ProjectPage.noRunsYet')}</div>
          )}
        </div>
      )}

      {isAllEmpty && latestImportJob ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <div>
            <h2 className="tp-heading text-lg">
              {latestImportJob.status === 'failed'
                ? t('ProjectPage.importDidNotComplete')
                : latestImportJob.status === 'succeeded'
                  ? t('ProjectPage.importCompleteButEmpty')
                  : t('ProjectPage.importInProgressHeading')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {latestImportJob.status === 'failed' ? (
                t('ProjectPage.importFailedMessage', {
                  source: SOURCE_LABEL[latestImportJob.source as Source] ?? latestImportJob.source,
                  error: latestImportJob.error,
                })
              ) : latestImportJob.status === 'succeeded' ? (
                t('ProjectPage.importSucceededEmptyMessage', {
                  source: SOURCE_LABEL[latestImportJob.source as Source] ?? latestImportJob.source,
                })
              ) : (
                t('ProjectPage.importInProgressMessage', {
                  source: SOURCE_LABEL[latestImportJob.source as Source] ?? latestImportJob.source,
                })
              )}
            </p>
          </div>
          {latestImportJob.status === 'failed' && (
            <div className="flex gap-2">
              <Link
                to={`/import/${latestImportJob.source}`}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                {t('ProjectPage.tryImportAgain')}
              </Link>
              <Link
                to={`/projects/${projectKey}/settings`}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                {t('ProjectPage.archiveThisProject')}
              </Link>
            </div>
          )}
        </div>
      ) : isAllEmpty ? (
        <div className="space-y-3">
          <div>
            <h2 className="tp-heading text-lg">{t('ProjectPage.getStartedHeading')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('ProjectPage.getStartedDescription')}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <GettingStartedStep
              icon={<FileTextIcon className="size-5" />}
              title={t('ProjectPage.step1Title')}
              tip={t('ProjectPage.step1Tip')}
              onClick={() => navigate(`/projects/${projectKey}/library`)}
            />
            <GettingStartedStep
              icon={<LayersIcon className="size-5" />}
              title={t('ProjectPage.step2Title')}
              tip={t('ProjectPage.step2Tip')}
              onClick={() => navigate(`/projects/${projectKey}/suites`)}
            />
            <GettingStartedStep
              icon={<CirclePlayIcon className="size-5" />}
              title={t('ProjectPage.step3Title')}
              tip={t('ProjectPage.step3Tip')}
              onClick={() => navigate(`/projects/${projectKey}/runs`)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_1fr_1.28fr]">
            <FoldersPanel
              folders={landing.folders}
              totalCount={landing.totalFolders}
              truncated={landing.truncated}
              onSeeAll={() => navigate(`/projects/${projectKey}/library`)}
              // add-folder-slug-urls: folderId here is actually a slug-path
              // (LandingFolder/LandingFolderChild.id, matching LandingSuite/
              // LandingRun's own key-not-id convention) — "" for the root
              // "Unsectioned" pseudo-row, whose URL is the bare /library
              // route, not /library/.
              onSelectFolder={(folderId) =>
                navigate(`/projects/${projectKey}/library${folderId ? `/${folderId}` : ''}`)
              }
            />
            <SuitesPanel
              suites={landing.suites}
              totalCount={landing.totalSuites}
              truncated={landing.truncated}
              onSeeAll={() => navigate(`/projects/${projectKey}/suites`)}
              onSelectSuite={(suiteId) => navigate(`/projects/${projectKey}/suites/${suiteId}`)}
            />
            <RunsPanel
              runs={landing.runs}
              totalCount={landing.totalRuns}
              onSeeAll={() => navigate(`/projects/${projectKey}/runs`)}
              onSelectRun={(runId) => navigate(`/runs/${runId}`)}
            />
          </div>
          {releases.length > 0 && (
            <ReleasesPanel
              releases={releases}
              onSeeAll={() => navigate(`/projects/${projectKey}/releases`)}
              onSelectRelease={(releaseKey) => navigate(`/projects/${projectKey}/releases/${releaseKey}`)}
            />
          )}
          <ReportsPanel
            total={reportsTeaser.total}
            counts={reportsTeaser.counts}
            flakyCases={reportsTeaser.flakyCases}
            passRateHistory={passRateHistory.points}
            onOpenReports={() => navigate(`/projects/${projectKey}/reports`)}
            onSelectFlakyCase={(caseKey) => navigate(`/projects/${projectKey}/cases/${caseKey}`)}
          />
          <ActivityPanel entries={activity.entries} />
        </div>
      )}
    </div>
  )
}
