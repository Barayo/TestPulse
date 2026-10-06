import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyIcon, CheckIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
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
  const { t } = useTranslation()
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
    const [{ data: tokensData }, { data: p }, r] = await Promise.all([
      api.GET('/api/v1/tokens'),
      api.GET('/api/v1/projects'),
      fetchAllPages((cursor) =>
        api.GET('/api/v1/roles', { params: { query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
      ),
    ])
    if (tokensData) setTokens(tokensData as Token[])
    if (p) setProjects(p as ProjectOption[])
    setRoles(r.items as RoleOption[])
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
      setError((apiError as { error?: string }).error ?? t('TokensPage.createTokenError'))
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
      <Breadcrumbs segments={[{ label: t('TokensPage.heading') }]} />
      <div className="flex items-center justify-between">
        <h1 className="tp-heading text-xl">{t('TokensPage.heading')}</h1>
        <Button onClick={() => setCreating(true)}>{t('TokensPage.newTokenButton')}</Button>
      </div>

      {justCreated && (
        <Card className="border-secondary">
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium">{t('TokensPage.copyTokenNowNote')}</p>
            <div className="flex items-center gap-2">
              <code className="block flex-1 rounded bg-muted p-2 text-sm break-all">{justCreated}</code>
              <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                {copied ? (
                  <>
                    <CheckIcon className="size-4" aria-hidden="true" />
                    {t('TokensPage.copiedLabel')}
                  </>
                ) : (
                  <>
                    <CopyIcon className="size-4" aria-hidden="true" />
                    {t('TokensPage.copyLabel')}
                  </>
                )}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setJustCreated(undefined)}>
              {t('TokensPage.doneButton')}
            </Button>
          </CardContent>
        </Card>
      )}

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">{t('TokensPage.newTokenCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="new-token-name">{t('TokensPage.nameLabel')}</Label>
                  <Input
                    id="new-token-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('TokensPage.namePlaceholder')}
                  />
                </div>
                <Button type="submit">{t('TokensPage.createButton')}</Button>
              </div>

              {!scoping ? (
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => setScoping(true)}
                >
                  {t('TokensPage.scopeToProjectButton')}
                </button>
              ) : (
                <div className="flex items-end gap-3 rounded-md border bg-muted/40 p-3">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="new-token-project">{t('TokensPage.projectLabel')}</Label>
                    <select
                      id="new-token-project"
                      aria-label={t('TokensPage.projectLabel')}
                      className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                      value={scopeProjectId}
                      onChange={(e) => {
                        setScopeProjectId(e.target.value)
                        setScopeRoleId('')
                      }}
                    >
                      <option value="">{t('TokensPage.selectProjectOption')}</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {scopeProjectId && (
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="new-token-role">{t('TokensPage.roleLabel')}</Label>
                      <select
                        id="new-token-role"
                        aria-label={t('TokensPage.roleLabel')}
                        className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                        value={scopeRoleId}
                        onChange={(e) => setScopeRoleId(e.target.value)}
                      >
                        <option value="">{t('TokensPage.selectRoleOption')}</option>
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
                    {t('TokensPage.removeScopeButton')}
                  </Button>
                </div>
              )}
            </form>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      <ul className="rounded-lg border">
        {tokens.map((token) => (
          <li key={token.id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
            <div>
              <span className="font-medium">{token.name}</span>
              <span className="ml-2 font-mono text-sm text-muted-foreground">{token.prefix}…</span>
              <div className="text-xs text-muted-foreground">
                {token.projectId && token.roleId ? (
                  <>
                    {projects.find((p) => p.id === token.projectId)?.name ?? t('TokensPage.unknownProject')}
                    {' · '}
                    {roles.find((r) => r.id === token.roleId)?.name ?? t('TokensPage.unknownRole')}
                  </>
                ) : (
                  t('TokensPage.fullAccess')
                )}
              </div>
            </div>
            {token.revokedAt ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-border" />
                {t('TokensPage.revokedLabel')}
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(token)}>
                {t('TokensPage.revokeButton')}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('TokensPage.revokeDialogTitle', { name: revokeTarget?.name })}</DialogTitle>
          <DialogDescription>
            {t('TokensPage.revokeDialogDescription')}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              {t('TokensPage.cancelButton')}
            </Button>
            <Button variant="destructive" onClick={() => void handleRevoke()}>
              {t('TokensPage.revokeButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
