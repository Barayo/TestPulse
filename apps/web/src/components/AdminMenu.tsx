import { Link, useLocation } from 'react-router'
import { ShieldIcon } from 'lucide-react'

// A top-level nav item, at the same level as the project switcher — not
// nested inside the personal account menu (UserMenu). Instance
// administration (People, Roles, Instance) is a distinct concern from
// personal/account settings, so it gets its own trigger (add-project-rbac,
// corrected after an initial pass folded it into UserMenu by mistake).
//
// A single direct link, not a dropdown (redesign-admin-shell): once inside
// any admin page, AdminShell's persistent tab strip owns moving between
// People/Roles/Instance — this control's only remaining job is the door in.
export function AdminMenu() {
  const { pathname } = useLocation()
  const isCurrent = pathname.startsWith('/settings/people') || pathname.startsWith('/settings/roles') ||
    pathname.startsWith('/settings/instance')

  return (
    <Link
      to="/settings/people"
      aria-current={isCurrent}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ${
        isCurrent ? 'font-semibold text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <ShieldIcon className="size-4" aria-hidden="true" />
      Admin
    </Link>
  )
}
