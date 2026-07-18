import { useEffect, useState, type FormEvent } from 'react'
import { CopyIcon, CheckIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/Breadcrumbs'

type Token = {
  id: string
  name: string
  prefix: string
  revokedAt: string | null
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [justCreated, setJustCreated] = useState<string>()
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState(false)

  async function load() {
    const { data } = await api.GET('/api/v1/tokens')
    if (data) setTokens(data as Token[])
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    const { data, error: apiError } = await api.POST('/api/v1/tokens', { body: { name } })
    if (apiError) {
      setError((apiError as { error?: string }).error ?? 'failed to create token')
      return
    }
    setName('')
    setCreating(false)
    const full = (data as { token?: string } | undefined)?.token
    if (full) setJustCreated(full)
    setCopied(false)
    await load()
  }

  async function handleRevoke(tokenId: string) {
    await api.DELETE('/api/v1/tokens/{tokenId}', { params: { path: { tokenId } } })
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
        <Card className="border-amber-500">
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
          <CardContent>
            <form onSubmit={handleCreate} className="flex items-end gap-3">
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
            </div>
            <Button variant="ghost" size="sm" onClick={() => void handleRevoke(t.id)}>
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
