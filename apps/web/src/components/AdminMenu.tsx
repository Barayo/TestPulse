import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ShieldIcon } from 'lucide-react'

// A top-level nav item, at the same level as the project switcher — not
// nested inside the personal account menu (UserMenu). Instance
// administration (People, Roles) is a distinct concern from personal/account
// settings, so it gets its own trigger (add-project-rbac, corrected after
// an initial pass folded it into UserMenu by mistake).
export function AdminMenu() {
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
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ShieldIcon className="size-4" aria-hidden="true" />
        Admin
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Admin"
          className="absolute right-0 z-50 mt-1 w-40 rounded-md border bg-card py-1 text-sm shadow-lg"
        >
          <Link
            role="menuitem"
            to="/settings/people"
            className="block px-3 py-1.5 hover:bg-accent"
            onClick={() => setOpen(false)}
          >
            People
          </Link>
          <Link
            role="menuitem"
            to="/settings/roles"
            className="block px-3 py-1.5 hover:bg-accent"
            onClick={() => setOpen(false)}
          >
            Roles
          </Link>
        </div>
      )}
    </div>
  )
}
