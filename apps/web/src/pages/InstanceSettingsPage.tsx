import { useEffect, useState } from 'react'
import { GlobeIcon, LockIcon } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { AdminShell } from '@/components/AdminShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

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
    <AdminShell>
      <h1 className="tp-heading text-xl">Instance</h1>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <GlobeIcon className="size-3.5" aria-hidden="true" />
          Access
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Public project access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Controls whether any project can ever be viewed without an account — a hard switch above each
              project's own &quot;Public access&quot; setting.
            </p>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Public project access, instance-wide</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{publicProjectsEnabled ? 'On' : 'Off'}</span>
                <Switch
                  aria-label="Public project access, instance-wide"
                  checked={publicProjectsEnabled ?? false}
                  disabled={publicProjectsEnabled === undefined}
                  onCheckedChange={() => void toggle()}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              When off: no project is reachable anonymously, even one with its own &quot;Public access&quot; left
              on — that project's setting is kept, not cleared, and takes effect again the moment this is switched
              back on.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <LockIcon className="size-3.5" aria-hidden="true" />
          Authentication
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 opacity-60">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <LockIcon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Require SSO sign-in</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Coming with SSO (v0.2)
                  </span>
                </div>
                <span className="block text-xs text-muted-foreground">
                  Block password login instance-wide once an identity provider is configured.
                </span>
              </div>
              <Switch aria-label="Require SSO sign-in" checked={false} disabled />
            </div>
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  )
}
