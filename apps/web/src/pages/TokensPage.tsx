import { useEffect, useState, type FormEvent } from 'react'
import { CopyIcon, CheckIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Breadcrumbs } from '@/components/Breadcrumbs'

type Token = {
  id: string
  name: string
  prefix: string
  projectId: string | null
  roleId: string | null
  revokedAt: string | null
}
type ProjectOption = { id: string; name: string }
type RoleOption = { id: string; name: string }

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  // Collapsed by default (design.md D5) — leaving it collapsed creates an
  // unscoped token, today's unchanged behavior (backlog #117).
  const [scoping, setScoping] = useState(false)
  const [scopeProjectId, setScopeProjectId] = useState('')
  const [scopeRoleId, setScopeRoleId] = useState('')
  const [justCreated, setJustCreated] = useState<string>()
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<Token | null>(null)

  async function load() {
    const [{ data: t }, { data: p }, { data: r }] = await Promise.all([
      api.GET('/api/v1/tokens'),
      api.GET('/api/v1/projects'),
      api.GET('/api/v1/roles'),
    ])
    if (t) setTokens(t as Token[])
    if (p) setProjects(p as ProjectOption[])
    if (r) setRoles(r as RoleOption[])
  }

  useEffect(() => {
    void load()
  }, [])

  function resetCreateForm() {
    setName('')
    setCreating(false)
    setScoping(false)
    setScopeProjectId('')
    setScopeRoleId('')
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    const scoped = scoping && scopeProjectId && scopeRoleId
    const { data, error: apiError } = await api.POST('/api/v1/tokens', {
      body: scoped ? { name, projectId: scopeProjectId, roleId: scopeRoleId } : { name },
    })
    if (apiError) {
      setError((apiError as { error?: string }).error ?? 'failed to create token')
      return
    }
    resetCreateForm()
    const full = (data as { token?: string } | undefined)?.token
    if (full) setJustCreated(full)
    setCopied(false)
    await load()
  }

  async function handleRevoke() {
    if (!revokeTarget) return
    await api.DELETE('/api/v1/tokens/{tokenId}', { params: { path: { tokenId: revokeTarget.id } } })
    setRevokeTarget(null)
    await load()
  }

  async function handleCopy() {
    if (!justCreated) return
    await navigator.clipboard.writeText(justCreated)
    setCopied(true)
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={[{ label: 'API tokens' }]} />
      <div className="flex items-center justify-between">
        <h1 className="tp-heading text-xl">API tokens</h1>
        <Button onClick={() => setCreating(true)}>+ New token</Button>
      </div>

      {justCreated && (
        <Card className="border-secondary">
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium">Copy this token now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="block flex-1 rounded bg-muted p-2 text-sm break-all">{justCreated}</code>
              <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                {copied ? (
                  <>
                    <CheckIcon className="size-4" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <CopyIcon className="size-4" aria-hidden="true" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setJustCreated(undefined)}>
              Done
            </Button>
          </CardContent>
        </Card>
      )}

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">New token</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="new-token-name">Name</Label>
                  <Input
                    id="new-token-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ci-agent"
                  />
                </div>
                <Button type="submit">Create</Button>
              </div>

              {!scoping ? (
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => setScoping(true)}
                >
                  Scope to a project (optional)
                </button>
              ) : (
                <div className="flex items-end gap-3 rounded-md border bg-muted/40 p-3">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="new-token-project">Project</Label>
                    <select
                      id="new-token-project"
                      aria-label="Project"
                      className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                      value={scopeProjectId}
                      onChange={(e) => {
                        setScopeProjectId(e.target.value)
                        setScopeRoleId('')
                      }}
                    >
                      <option value="">Select a project…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {scopeProjectId && (
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="new-token-role">Role</Label>
                      <select
                        id="new-token-role"
                        aria-label="Role"
                        className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                        value={scopeRoleId}
                        onChange={(e) => setScopeRoleId(e.target.value)}
                      >
                        <option value="">Select a role…</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setScoping(false)
                      setScopeProjectId('')
                      setScopeRoleId('')
                    }}
                  >
                    Remove scope
                  </Button>
                </div>
              )}
            </form>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      <ul className="rounded-lg border">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
            <div>
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 font-mono text-sm text-muted-foreground">{t.prefix}…</span>
              <div className="text-xs text-muted-foreground">
                {t.projectId && t.roleId ? (
                  <>
                    {projects.find((p) => p.id === t.projectId)?.name ?? 'Unknown project'}
                    {' · '}
                    {roles.find((r) => r.id === t.roleId)?.name ?? 'Unknown role'}
                  </>
                ) : (
                  'Full access'
                )}
              </div>
            </div>
            {t.revokedAt ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-border" />
                Revoked
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(t)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Revoke "{revokeTarget?.name}"?</DialogTitle>
          <DialogDescription>
            Any CI/agent using it immediately loses access. This cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleRevoke()}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
