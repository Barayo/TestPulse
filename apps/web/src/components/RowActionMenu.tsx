import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontalIcon } from 'lucide-react'

export type RowActionMenuItem = {
  label: string
  onSelect: () => void
  icon?: ReactNode
  danger?: boolean
  dividerBefore?: boolean
}

// Closed-by-default per-row "⋯" menu — the click-outside/Escape-to-close
// logic mirrors AdminMenu.tsx exactly, applied to a row context instead of
// top-level nav (redesign-delete-mode-menu).
export function RowActionMenu({ label, items }: { label: string; items: RowActionMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontalIcon className="size-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 z-50 mt-1 w-40 rounded-md border bg-card py-1 text-sm shadow-lg"
        >
          {items.map((item) => (
            <span key={item.label}>
              {item.dividerBefore && <span role="separator" className="my-1 block border-t" />}
              <button
                type="button"
                role="menuitem"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent ${
                  item.danger ? 'text-destructive' : ''
                }`}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
