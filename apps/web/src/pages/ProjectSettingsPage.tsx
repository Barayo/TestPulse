import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { api } from '@/lib/api'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

// Project-level settings (enable-public-project-access) — currently just
// the "Public access" toggle. Gated on manageProject (broader than
// Tenant-Admin-only, matching the permission PATCH /projects/{projectKey}
// already requires server-side), following the same client-side
// self-gating idiom as RolesPage.tsx/InstanceSettingsPage.tsx.
export default function ProjectSettingsPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const permissions = useProjectPermissions(projectKey)
  const [publicAccess, setPublicAccess] = useState<boolean>()
  const [publicProjectsEnabled, setPublicProjectsEnabled] = useState<boolean>()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!projectKey || !permissions?.manageProject) return
    void api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }).then(({ data }) => {
      if (data) setPublicAccess(data.publicAccess)
    })
    void api.GET('/api/v1/meta').then(({ data }) => {
      if (data) setPublicProjectsEnabled(data.publicProjectsEnabled)
    })
  }, [projectKey, permissions?.manageProject])

  if (permissions !== undefined && !permissions.manageProject) {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
  }

  async function toggle() {
    if (!projectKey || publicAccess === undefined) return
    const next = !publicAccess
    const { data } = await api.PATCH('/api/v1/projects/{projectKey}', {
      params: { path: { projectKey } },
      body: { publicAccess: next },
    })
    if (data) setPublicAccess(data.publicAccess)
  }

  // The project's own unified URL (unify-authenticated-and-public-views) —
  // the same page a signed-in member sees, read-only for anyone else.
  const publicUrl = projectKey ? `${window.location.origin}/projects/${projectKey}` : ''

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Settings' }]} />

      <Card>
        <CardHeader>
          <CardTitle>Public access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Anyone with this link can view the project&apos;s cases, runs, and results without an account. Nothing
            can be created, edited, or run by an anonymous visitor.
          </p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Public access</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{publicAccess ? 'On' : 'Off'}</span>
              <Switch
                aria-label="Public access"
                checked={publicAccess ?? false}
                disabled={publicAccess === undefined || publicProjectsEnabled === false}
                onCheckedChange={() => void toggle()}
              />
            </div>
          </div>
          {publicProjectsEnabled === false && (
            <p className="text-xs text-muted-foreground">
              Public project access is turned off for this instance. Ask a Tenant Admin to enable it under
              Administration → Instance.
            </p>
          )}
          {publicAccess && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="flex-1 truncate font-mono text-xs">{publicUrl}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(publicUrl)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
