import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import type { components } from '@testpulse/shared/api'

type StepGroup = components['schemas']['StepGroup']

// Reuses AssignDialog's exact search-and-pick shape (add-reusable-steps,
// Pepe's design) — the same interaction this app already uses to pick a
// person/team, applied to picking a shared step group to insert.
export function InsertStepGroupDialog({
  open,
  onOpenChange,
  projectKey,
  onInsert,
  excludeGroupKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectKey: string
  onInsert: (group: StepGroup) => void
  excludeGroupKey?: string
}) {
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<StepGroup[]>([])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    void api.GET('/api/v1/projects/{projectKey}/step-groups', { params: { path: { projectKey } } }).then(({ data }) => {
      setGroups(data ?? [])
    })
  }, [open, projectKey])

  const filtered = useMemo(() => groups.filter((g) => g.name.toLowerCase().includes(query.toLowerCase())), [groups, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Insert shared group…</DialogTitle>
        <Input autoFocus placeholder="Search shared groups…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {filtered.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">No matching shared groups.</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {filtered.map((g) => {
              const isAdjacent = g.key === excludeGroupKey
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    disabled={isAdjacent}
                    className={`flex w-full flex-col items-start rounded-md px-2 py-2 text-left text-sm ${
                      isAdjacent ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent'
                    }`}
                    onClick={() => onInsert(g)}
                  >
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {isAdjacent ? 'Already referenced directly above' : `${g.steps.length} step${g.steps.length === 1 ? '' : 's'}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
