import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { ProjectSwitcher } from '@/components/ProjectSwitcher'
import { useActiveProjectId } from '@/lib/useActiveProject'
import { useProjectSummaries } from '@/lib/useProjectSummaries'
import { DataRevisionProvider } from '@/lib/DataRevision'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectPage from '@/pages/ProjectPage'
import SuitesPage from '@/pages/SuitesPage'
import RunsPage from '@/pages/RunsPage'
import FolderExplorerPage from '@/pages/FolderExplorerPage'
import RunPage from '@/pages/RunPage'

type SystemStatus = 'checking' | 'ready' | 'unavailable'

function HealthBadge() {
  const [status, setStatus] = useState<SystemStatus>('checking')
  const [version, setVersion] = useState<string>()

  useEffect(() => {
    async function check() {
      try {
        const { response } = await api.GET('/readyz')
        setStatus(response.ok ? 'ready' : 'unavailable')
        const { data } = await api.GET('/api/v1/meta')
        setVersion(data?.version)
      } catch {
        setStatus('unavailable')
      }
    }
    void check()
  }, [])

  return (
    <div className="flex items-center gap-2">
      {version && <span className="text-sm text-muted-foreground">v{version}</span>}
      <Badge
        variant={
          status === 'ready' ? 'default' : status === 'checking' ? 'secondary' : 'destructive'
        }
      >
        {status === 'ready'
          ? 'System ready'
          : status === 'checking'
            ? 'Checking…'
            : 'API unavailable'}
      </Badge>
    </div>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const activeProjectId = useActiveProjectId()
  const projects = useProjectSummaries()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="tp-heading text-xl">
              TestPulse
            </Link>
            <ProjectSwitcher
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={(id) => navigate(`/projects/${id}`)}
            />
          </div>
          <HealthBadge />
        </div>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <DataRevisionProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectPage />} />
            <Route path="/projects/:projectId/suites" element={<SuitesPage />} />
            <Route path="/projects/:projectId/runs" element={<RunsPage />} />
            <Route path="/projects/:projectId/library" element={<FolderExplorerPage />} />
            <Route path="/projects/:projectId/library/:folderId" element={<FolderExplorerPage />} />
            <Route path="/runs/:runId" element={<RunPage />} />
          </Routes>
        </Layout>
      </DataRevisionProvider>
    </BrowserRouter>
  )
}

export default App
