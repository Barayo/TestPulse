import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Avatar } from '@/components/Avatar'

type Props = {
  user: { id: string; email: string; displayName?: string | null; avatarKey?: string | null }
  onLogout: () => void
}

// Replaces the header's plain "{email} · Log out" with a menu — the trigger
// for the previously-orphaned /settings/tokens route (add-project-rbac; no
// in-app link existed before this). Personal/account items only — API
// tokens and Log out. Instance administration (Users, Teams) lives in the
// separate top-level AdminMenu, not here: it isn't a personal-account
// concern, so it doesn't belong under the user's own email.
export function UserMenu({ user, onLogout }: Props) {
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
        className="flex max-w-[10rem] items-center gap-1.5 truncate rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:max-w-none"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">
          <Avatar
            seed={user.displayName || user.email}
            avatarKey={user.avatarKey}
            userId={user.id}
            className="size-5 rounded-full text-[10px]"
          />
        </span>
        <span className="truncate">{user.email}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-1 w-48 rounded-md border bg-card py-1 text-sm shadow-lg"
        >
          <Link
            role="menuitem"
            to="/settings/profile"
            className="block px-3 py-1.5 hover:bg-accent"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <Link
            role="menuitem"
            to="/settings/tokens"
            className="block px-3 py-1.5 hover:bg-accent"
            onClick={() => setOpen(false)}
          >
            API tokens
          </Link>
          <div className="my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left hover:bg-accent"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
