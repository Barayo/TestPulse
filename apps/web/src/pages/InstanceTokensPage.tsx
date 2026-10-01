import { useCallback, useEffect, useState } from 'react'
import { KeyRoundIcon } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { LoadMoreButton } from '@/components/LoadMoreButton'
import { Avatar } from '@/components/Avatar'
import { AdminShell } from '@/components/AdminShell'

type InstanceToken = {
  id: string
  ownerEmail: string
  ownerDisplayName?: string | null
  name: string
  prefix: string
  projectKey?: string | null
  roleName?: string | null
  revokedAt: string | null
  createdAt: string
}

export default function InstanceTokensPage() {
  const { user: me } = useAuth()
  const [tokens, setTokens] = useState<InstanceToken[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = useCallback(
    (cursor?: string) =>
      api
        .GET('/api/v1/tokens/instance', { params: { query: { cursor } } })
        .then(({ data }) => data ?? { items: [], nextCursor: null }),
    [],
  )

  const load = useCallback(async () => {
    const page = await fetchPage()
    setTokens(page.items as InstanceToken[])
    setCursor(page.nextCursor)
  }, [fetchPage])

  useEffect(() => {
    if (me?.isTenantAdmin) void load()
  }, [me, load])

  async function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const page = await fetchPage(cursor)
      setTokens((prev) => [...prev, ...(page.items as InstanceToken[])])
      setCursor(page.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  if (!me?.isTenantAdmin) {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
  }

  return (
    <AdminShell>
      <section className="space-y-3">
        <h1 className="tp-heading text-xl">
          Agent Tokens<span className="ml-2 text-sm font-normal text-muted-foreground">{tokens.length}</span>
        </h1>

        {tokens.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <KeyRoundIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
            <p className="mb-1 text-sm font-medium">No agent tokens yet</p>
            <p className="text-sm text-muted-foreground">
              Tokens created from Settings → API tokens by anyone in this instance will show up here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[1fr_1fr_84px] items-center gap-3 border-b px-4 py-2 sm:grid-cols-[1fr_1fr_110px_84px]">
              <span className="tp-label">Owner</span>
              <span className="tp-label">Token</span>
              <span className="tp-label hidden sm:block">Created</span>
              <span className="tp-label">Status</span>
            </div>
            <ul aria-label="Agent tokens" className="text-sm">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="grid grid-cols-[1fr_1fr_84px] items-center gap-3 border-b px-4 py-2 last:border-b-0 sm:grid-cols-[1fr_1fr_110px_84px]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar seed={t.ownerEmail} className="size-7 shrink-0 rounded-full text-xs" />
                    <div className="min-w-0 leading-tight">
                      {t.ownerDisplayName && t.ownerDisplayName !== t.ownerEmail ? (
                        <>
                          <div className="truncate text-sm font-semibold">{t.ownerDisplayName}</div>
                          <div className="truncate text-xs text-muted-foreground">{t.ownerEmail}</div>
                        </>
                      ) : (
                        <div className="truncate text-sm font-semibold">{t.ownerEmail}</div>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 leading-tight">
                    <div className="truncate">
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{t.prefix}…</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.projectKey && t.roleName ? `${t.projectKey} · ${t.roleName}` : 'Full access'}
                    </div>
                  </div>

                  <div className="hidden text-sm text-muted-foreground sm:block">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`size-1.5 rounded-full ${t.revokedAt ? 'bg-border' : 'bg-primary'}`} />
                    {t.revokedAt ? 'Revoked' : 'Active'}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <LoadMoreButton hasMore={!!cursor} loading={loadingMore} onClick={() => void loadMore()} />
      </section>
    </AdminShell>
  )
}
