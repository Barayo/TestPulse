import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChevronDown, FileTextIcon, LayersIcon, CirclePlayIcon, UsersIcon, SettingsIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { FoldersPanel, SuitesPanel, RunsPanel } from '@/components/ProjectLandingPanels'
import { HealthRing, StatusPill } from '@/components/HealthBar'
import { useProjectLanding } from '@/lib/useProjectLanding'
import { useProjectSummaries, type ProjectSummary } from '@/lib/useProjectSummaries'
import { useProjectSwitcher } from '@/lib/useProjectSwitcher'
import { useProjectPermissions, useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import { timeAgo } from '@/lib/timeAgo'
import type { components } from '@testpulse/shared/api'

type Project = components['schemas']['Project']

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
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const permissions = useProjectPermissions(projectKey)
  const access = useProjectReadAccess(projectKey, user, authLoading)
  const { canSwitch, openSwitcher } = useProjectSwitcher()
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const landing = useProjectLanding(projectKey, access === 'member', access === 'loading')
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

  if (!projectKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Project not found. <Link to="/" className="underline">Go to Projects</Link>
        {!user && !authLoading && (
          <>
            {' '}
            ·{' '}
            <Link to="/login" state={{ from: `/projects/${projectKey}` }} className="underline">
              Log in
            </Link>
          </>
        )}
      </p>
    )
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
            <h1 className="tp-heading flex items-center gap-1.5 text-2xl">
              {project.name}
              {canSwitch && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-primary"
                  onClick={openSwitcher}
                  title="Switch project (⌘K)"
                  aria-label="Switch project"
                >
                  <ChevronDown className="size-5" aria-hidden="true" />
                </button>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">{project.key} · project overview</p>
          </div>
        )}
        <div className="flex items-center gap-4">
          {user?.isTenantAdmin && (
            <Link
              to={`/projects/${projectKey}/members`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <UsersIcon className="size-4" aria-hidden="true" />
              Members
            </Link>
          )}
          {permissions?.manageProject && (
            <Link
              to={`/projects/${projectKey}/settings`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
              Settings
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
              <span className="text-xs text-muted-foreground">Pass rate across all suites</span>
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
                <div className="text-[11px] text-muted-foreground">Suites</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex size-7.5 items-center justify-center rounded-md bg-accent text-primary">
                <FileTextIcon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <div className="text-base leading-tight font-bold tabular-nums">{summary.caseCount}</div>
                <div className="text-[11px] text-muted-foreground">Cases</div>
              </div>
            </div>
          </div>

          <div className="hidden self-stretch border-l border-border md:block" aria-hidden="true" />

          {summary.lastRunAt && isValidDate(summary.lastRunAt) ? (
            <div>
              <div className="text-[11px] tracking-wide text-muted-foreground uppercase">Last run</div>
              <div className="text-sm font-bold tabular-nums">{timeAgo(summary.lastRunAt)}</div>
              {landing.runs[0] && (
                <div className="truncate text-xs text-muted-foreground">
                  {landing.runs[0].name}
                  {landing.runs[0].passRate !== null && ` · ${landing.runs[0].passRate}%`}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No runs yet</div>
          )}
        </div>
      )}

      {isAllEmpty ? (
        <div className="space-y-3">
          <div>
            <h2 className="tp-heading text-lg">Get started</h2>
            <p className="text-sm text-muted-foreground">
              This project doesn't have any test content yet — three steps to get it running.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <GettingStartedStep
              icon={<FileTextIcon className="size-5" />}
              title="1. Add your first test case"
              tip="Describe the steps to follow and what you expect to happen. You can always edit it later — every change keeps its own version."
              onClick={() => navigate(`/projects/${projectKey}/library`)}
            />
            <GettingStartedStep
              icon={<LayersIcon className="size-5" />}
              title="2. Group your cases into a suite"
              tip="Suites decide what runs together, independent of how cases are organized into sections."
              onClick={() => navigate(`/projects/${projectKey}/suites`)}
            />
            <GettingStartedStep
              icon={<CirclePlayIcon className="size-5" />}
              title="3. Run the suite"
              tip="Every run captures a pass or fail per case, so you can track quality over time."
              onClick={() => navigate(`/projects/${projectKey}/runs`)}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_1fr_1.28fr]">
          <FoldersPanel
            folders={landing.folders}
            totalCount={landing.totalFolders}
            onSeeAll={() => navigate(`/projects/${projectKey}/library`)}
            onSelectFolder={(folderId) => navigate(`/projects/${projectKey}/library/${folderId}`)}
          />
          <SuitesPanel
            suites={landing.suites}
            totalCount={landing.totalSuites}
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
      )}
    </div>
  )
}
