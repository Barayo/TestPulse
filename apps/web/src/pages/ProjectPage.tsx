import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { FoldersPanel, SuitesPanel, RunsPanel } from '@/components/ProjectLandingPanels'
import { useProjectLanding } from '@/lib/useProjectLanding'
import type { components } from '@testpulse/shared/api'

type Project = components['schemas']['Project']

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project>()
  const landing = useProjectLanding(projectId)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void api
      .GET('/api/v1/projects/{projectId}', { params: { path: { projectId } } })
      .then(({ data }) => {
        if (!cancelled) setProject(data)
      })
      .catch(() => {
        if (!cancelled) setProject(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (!projectId) return null

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Projects', href: '/' }, { label: project?.name ?? '' }]} />

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
    </div>
  )
}
