import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { components } from '@testpulse/shared/api'

type Step = components['schemas']['Step']
type StepGroup = components['schemas']['StepGroup']

// Names and creates a shared step group from a selection of the author's
// own plain steps already made in CaseStepsList (click/Shift+Click on
// step badges), then hands the created group back so the caller can
// replace the selection with a reference to it (add-reusable-steps).
export function ExtractStepGroupDialog({
  open,
  onOpenChange,
  projectKey,
  selectedSteps,
  onExtracted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectKey: string
  selectedSteps: Step[]
  onExtracted: (group: StepGroup) => void
}) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  async function create() {
    if (!name.trim() || selectedSteps.length === 0) return
    setSubmitting(true)
    try {
      const { data, error: apiError, response } = await api.POST('/api/v1/projects/{projectKey}/step-groups', {
        params: { path: { projectKey } },
        body: { name: name.trim(), steps: selectedSteps.map((s) => ({ action: s.action, expected: s.expected })) },
      })
      if (!response.ok || !data) {
        setError((apiError as { error?: string })?.error ?? 'Could not create the group.')
        return
      }
      setError(undefined)
      onExtracted(data)
      setName('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Extract as shared step group</DialogTitle>
        <DialogDescription>
          Creates a new shared group from the {selectedSteps.length} selected step{selectedSteps.length === 1 ? '' : 's'} and
          replaces them here with a reference to it.
        </DialogDescription>
        <div className="space-y-1">
          <Label htmlFor="extract-group-name">Group name</Label>
          <Input id="extract-group-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Log in as admin" />
        </div>
        <div className="rounded-lg border bg-background p-2.5">
          <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            {selectedSteps.map((s, i) => (
              <li key={i}>{s.action || '(empty step)'}</li>
            ))}
          </ul>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || submitting} onClick={() => void create()}>
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
