import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/useAuth'

type SystemStatus = 'checking' | 'ready' | 'unavailable'

export function HealthBadge() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SystemStatus>('checking')
  const [version, setVersion] = useState<string>()
  const { mcpEnabled } = useAuth()

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
      {version && (
        <span className="text-sm text-muted-foreground">{t('HealthBadge.versionLabel', { version })}</span>
      )}
      <Badge
        variant={
          status === 'ready' ? 'default' : status === 'checking' ? 'secondary' : 'destructive'
        }
      >
        {status === 'ready'
          ? t('HealthBadge.systemReadyLabel')
          : status === 'checking'
            ? t('HealthBadge.checkingLabel')
            : t('HealthBadge.apiUnavailableLabel')}
      </Badge>
      {mcpEnabled && (
        <Badge
          className="border-transparent bg-primary/10 text-primary"
          title={t('HealthBadge.mcpBadgeTitle')}
        >
          {t('HealthBadge.mcpBadgeLabel')}
        </Badge>
      )}
    </div>
  )
}
