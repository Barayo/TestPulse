import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type SystemStatus = 'checking' | 'ready' | 'unavailable'

function App() {
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">TestPulse</h1>
          <div className="flex items-center gap-2">
            {version && (
              <span className="text-sm text-muted-foreground">v{version}</span>
            )}
            <Badge
              variant={
                status === 'ready'
                  ? 'default'
                  : status === 'checking'
                    ? 'secondary'
                    : 'destructive'
              }
            >
              {status === 'ready'
                ? 'System ready'
                : status === 'checking'
                  ? 'Checking…'
                  : 'API unavailable'}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
            <CardDescription>
              Nothing here yet — test projects, suites, and runs arrive in
              upcoming releases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This walking skeleton proves the full pipeline: React UI →
              OpenAPI-generated client → Go API → PostgreSQL.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default App
