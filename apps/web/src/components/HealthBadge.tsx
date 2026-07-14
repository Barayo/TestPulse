import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

type SystemStatus = 'checking' | 'ready' | 'unavailable'

export function HealthBadge() {
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
