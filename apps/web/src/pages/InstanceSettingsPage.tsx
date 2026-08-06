import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Tenant-Admin-only instance-wide settings (enable-public-project-access).
// Self-gates the same way RolesPage.tsx/PeoplePage.tsx do — a client-side
// check, not just the route-level RequireAuth — since a non-admin logged-in
// user can still navigate here directly.
export default function InstanceSettingsPage() {
  const { user: me } = useAuth()
  const [publicProjectsEnabled, setPublicProjectsEnabled] = useState<boolean>()

  useEffect(() => {
    if (!me?.isTenantAdmin) return
    void api.GET('/api/v1/meta').then(({ data }) => {
      if (data) setPublicProjectsEnabled(data.publicProjectsEnabled)
    })
  }, [me])

  if (!me?.isTenantAdmin) {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
  }

  async function toggle() {
    if (publicProjectsEnabled === undefined) return
    const next = !publicProjectsEnabled
    const { data } = await api.PATCH('/api/v1/instance-settings', { body: { publicProjectsEnabled: next } })
    if (data) setPublicProjectsEnabled(data.publicProjectsEnabled)
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Instance' }]} />

      <Card>
        <CardHeader>
          <CardTitle>Public project access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Controls whether any project can ever be viewed without an account — a hard switch above each project's
            own &quot;Public access&quot; setting.
          </p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Public project access, instance-wide</span>
            <button
              type="button"
              role="switch"
              aria-checked={publicProjectsEnabled ?? false}
              aria-label="Public project access, instance-wide"
              disabled={publicProjectsEnabled === undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${
                publicProjectsEnabled ? 'border-primary text-primary' : 'border-input text-muted-foreground'
              }`}
              onClick={() => void toggle()}
            >
              {publicProjectsEnabled ? 'On' : 'Off'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            When off: no project is reachable anonymously, even one with its own &quot;Public access&quot; left on —
            that project's setting is kept, not cleared, and takes effect again the moment this is switched back on.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
