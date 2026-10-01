import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { UsersIcon, ShieldCheckIcon, SettingsIcon, KeyRoundIcon } from 'lucide-react'

// Persistent tab strip shared by the four Administration pages
// (redesign-admin-shell, extended by add-instance-token-listing) —
// replaces the old dropdown-only navigation between them, which offered
// no way to move between pages once inside one. The personal
// /settings/tokens page still stays outside this shell: it only ever
// shows the caller's own tokens, so there is nothing "admin" about it to
// fold in. Agent Tokens here is a different, genuinely admin-scoped
// resource — every user's tokens, Tenant-Admin-only — so it belongs in
// the shell even though the personal page doesn't.
const TABS = [
  { to: '/settings/people', label: 'People', icon: UsersIcon },
  { to: '/settings/roles', label: 'Roles', icon: ShieldCheckIcon },
  { to: '/settings/agent-tokens', label: 'Agent Tokens', icon: KeyRoundIcon },
  { to: '/settings/instance', label: 'Instance', icon: SettingsIcon },
] as const

export function AdminShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="space-y-6">
      <nav aria-label="Administration" className="inline-flex gap-0.5 rounded-2xl bg-muted p-1">
        {TABS.map(({ to, label, icon: Icon }) => {
          const isActive = pathname === to
          return (
            <Link
              key={to}
              to={to}
              role="tab"
              aria-selected={isActive}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold ${
                isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`size-4 ${isActive ? 'text-primary' : ''}`} aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
