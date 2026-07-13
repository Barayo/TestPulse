import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export type CaseOption = { id: string; title: string }

type Props = {
  cases: CaseOption[]
  onSelect: (caseId: string) => void
}

export function CasePicker({ cases, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = useMemo(
    () => cases.filter((c) => c.title.toLowerCase().includes(query.toLowerCase())),
    [cases, query],
  )

  return (
    <>
      <button
        type="button"
        className="w-full rounded-md border border-dashed px-3 py-1.5 text-left text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        + Add case…
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">Add a case</DialogTitle>
          <Input
            autoFocus
            placeholder="Search cases…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="p-2 text-sm text-muted-foreground">No matching cases.</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      onSelect(c.id)
                      setOpen(false)
                    }}
                  >
                    {c.title}
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
