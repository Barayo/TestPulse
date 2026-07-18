import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FolderIcon, LayersIcon, CirclePlayIcon, UsersIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { FoldersPanel, SuitesPanel, RunsPanel } from '@/components/ProjectLandingPanels'
import { StatusPill, ProgressBar } from '@/components/HealthBar'
import { useProjectLanding } from '@/lib/useProjectLanding'
import { useProjectSummaries } from '@/lib/useProjectSummaries'
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
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const landing = useProjectLanding(projectId)
  const summaries = useProjectSummaries()
  const summary = summaries.find((s) => s.id === projectId)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setNotFound(false)
    void api
      .GET('/api/v1/projects/{projectId}', { params: { path: { projectId } } })
      .then(({ data }) => {
        if (cancelled) return
        if (data) setProject(data)
        else setNotFound(true)
      })
      .catch(() => {
        if (!cancelled) setProject(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (!projectId) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Project not found. <Link to="/" className="underline">Go to Projects</Link>
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
      <div className="flex items-center justify-between gap-4">
        <Breadcrumbs segments={[{ label: 'Projects', href: '/' }, { label: project?.name ?? '' }]} />
        {user?.isTenantAdmin && (
          <Link
            to={`/projects/${projectId}/members`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <UsersIcon className="size-4" aria-hidden="true" />
            Members
          </Link>
        )}
      </div>

      {summary && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
          <StatusPill rate={summary.passRate} />
          <div className="min-w-40 flex-1">
            <ProgressBar rate={summary.passRate} />
          </div>
          <span className="text-sm text-muted-foreground">{summary.suiteCount} suites</span>
          <span className="text-sm text-muted-foreground">{summary.caseCount} cases</span>
          {summary.lastRunAt && isValidDate(summary.lastRunAt) && (
            <span className="text-sm text-muted-foreground">Last run {timeAgo(summary.lastRunAt)}</span>
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
              icon={<FolderIcon className="size-5" />}
              title="1. Add your first test case"
              tip="Describe the steps to follow and what you expect to happen. You can always edit it later — every change keeps its own version."
              onClick={() => navigate(`/projects/${projectId}/library`)}
            />
            <GettingStartedStep
              icon={<LayersIcon className="size-5" />}
              title="2. Group your cases into a suite"
              tip="Suites decide what runs together, independent of how cases are organized into sections."
              onClick={() => navigate(`/projects/${projectId}/suites`)}
            />
            <GettingStartedStep
              icon={<CirclePlayIcon className="size-5" />}
              title="3. Run the suite"
              tip="Every run captures a pass or fail per case, so you can track quality over time."
              onClick={() => navigate(`/projects/${projectId}/runs`)}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FoldersPanel
            folders={landing.folders}
            totalCount={landing.totalFolders}
            onSeeAll={() => navigate(`/projects/${projectId}/library`)}
            onSelectFolder={(folderId) => navigate(`/projects/${projectId}/library/${folderId}`)}
          />
          <SuitesPanel
            suites={landing.suites}
            totalCount={landing.totalSuites}
            onSeeAll={() => navigate(`/projects/${projectId}/suites`)}
            onSelectSuite={(suiteId) => navigate(`/projects/${projectId}/suites#suite-${suiteId}`)}
          />
          <RunsPanel
            runs={landing.runs}
            totalCount={landing.totalRuns}
            onSeeAll={() => navigate(`/projects/${projectId}/runs`)}
            onSelectRun={(runId) => navigate(`/runs/${runId}`)}
          />
        </div>
      )}
    </div>
  )
}
