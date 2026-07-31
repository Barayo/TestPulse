import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { isEditableElementFocused } from '@/lib/keyboardShortcutGuard'

export type ShortcutEntry = { keys: string; label: string }

export function RunShortcutsHint({ shortcuts }: { shortcuts: ShortcutEntry[] }) {
  return (
    <div
      aria-label="Keyboard shortcuts"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-1 py-2 text-xs text-muted-foreground"
    >
      {shortcuts.map((s) => (
        <span key={s.keys} className="flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[0.7rem]">{s.keys}</kbd>
          {s.label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[0.7rem]">?</kbd>
        all shortcuts
      </span>
    </div>
  )
}

export function RunShortcutsOverlay({ shortcuts }: { shortcuts: ShortcutEntry[] }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== '?') return
      if (isEditableElementFocused()) return
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <ul className="space-y-1.5 text-sm">
          {shortcuts.map((s) => (
            <li key={s.keys} className="flex items-center gap-2">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{s.keys}</kbd>
              {s.label}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
