import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectPage from '@/pages/ProjectPage'
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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            TestPulse
          </Link>
          <HealthBadge />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/runs/:runId" element={<RunPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
