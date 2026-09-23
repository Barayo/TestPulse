import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { XIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type WebhookDestination = components['schemas']['WebhookDestination']

// Project-scoped webhook destinations (add-run-notifications) — fires on
// a failed/blocked result or a run close. Mirrors CustomFieldsCard's
// list/create/delete shape; lives on ProjectSettingsPage, which already
// gates the whole page on manageProject, so this card needs no
// permission check of its own.
export function WebhooksCard({ projectKey }: { projectKey: string }) {
  const [destinations, setDestinations] = useState<WebhookDestination[]>([])
  const [newURL, setNewURL] = useState('')

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/v1/projects/{projectKey}/webhooks', { params: { path: { projectKey } } })
    setDestinations(data ?? [])
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  async function addDestination(e: FormEvent) {
    e.preventDefault()
    if (!newURL.trim()) return
    await api.POST('/api/v1/projects/{projectKey}/webhooks', {
      params: { path: { projectKey } },
      body: { url: newURL.trim() },
    })
    setNewURL('')
    await load()
  }

  async function removeDestination(id: string) {
    await api.DELETE('/api/v1/webhooks/{webhookId}', { params: { path: { webhookId: id } } })
    await load()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhooks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Notified on a failed or blocked result, and when a run closes. Delivery is best-effort and not retried.
        </p>
        {destinations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No webhook destinations yet.</p>
        ) : (
          <ul className="space-y-1">
            {destinations.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{d.url}</span>
                <button
                  type="button"
                  aria-label={`Remove ${d.url}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void removeDestination(d.id)}
                >
                  <XIcon className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => void addDestination(e)} className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="new-webhook-url">Webhook URL</Label>
            <Input
              id="new-webhook-url"
              type="url"
              value={newURL}
              onChange={(e) => setNewURL(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
            />
          </div>
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
