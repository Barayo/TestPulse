import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export type UserOption = { id: string; email: string }

type Props = {
  users: UserOption[]
  onSelect: (userId: string) => void
}

// A search-dialog-over-a-list-of-options picker for a single pick at a time
// (add-project-rbac: TeamDrawer/project Members both need "pick a user not
// already in this list") — a fine shape for a short, rarely-changing list
// like a team's members, unlike suite membership, which moved to a
// checkbox-grid (rework-suite-membership-ux) once one-at-a-time selection
// stopped scaling.
export function UserPicker({ users, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = useMemo(
    () => users.filter((u) => u.email.toLowerCase().includes(query.toLowerCase())),
    [users, query],
  )

  return (
    <>
      <button
        type="button"
        className="w-full rounded-md border border-dashed px-3 py-1.5 text-left text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        + Add member…
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">Add a member</DialogTitle>
          <Input
            autoFocus
            placeholder="Search users…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="p-2 text-sm text-muted-foreground">No matching users.</li>
            ) : (
              filtered.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      onSelect(u.id)
                      setOpen(false)
                    }}
                  >
                    {u.email}
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
