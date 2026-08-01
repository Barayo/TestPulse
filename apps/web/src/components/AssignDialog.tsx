import { useEffect, useId, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentAssignee?: string
  suggestions: string[]
  onAssign: (assignee: string) => void
  title?: string
}

export function AssignDialog({ open, onOpenChange, currentAssignee, suggestions, onAssign, title }: Props) {
  const [value, setValue] = useState(currentAssignee ?? '')
  const listId = useId()

  useEffect(() => {
    if (open) setValue(currentAssignee ?? '')
  }, [open, currentAssignee])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{title ?? 'Assign to…'}</DialogTitle>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            onAssign(value.trim())
            onOpenChange(false)
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={listId}>Name</Label>
            <Input
              id={listId}
              list={`${listId}-suggestions`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Name"
              autoFocus
            />
            <datalist id={`${listId}-suggestions`}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="submit" size="sm" disabled={!value.trim()}>
              Assign
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
