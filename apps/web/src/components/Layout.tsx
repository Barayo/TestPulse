import { useNavigate, useLocation, Link } from 'react-router'
import { ProjectSwitcher } from '@/components/ProjectSwitcher'
import { AdminMenu } from '@/components/AdminMenu'
import { UserMenu } from '@/components/UserMenu'
import { HealthBadge } from '@/components/HealthBadge'
import { useActiveProjectId } from '@/lib/useActiveProject'
import { useProjectSummaries } from '@/lib/useProjectSummaries'
import { ProjectSwitcherProvider } from '@/lib/useProjectSwitcher'
import { useAuth } from '@/lib/useAuth'

// Extracted from App.tsx (unify-authenticated-and-public-views) so it can
// be tested in isolation and so the anonymous-viewer banner (D5) has a
// home outside any single route's page component — Layout now wraps both
// authenticated pages (inside RequireAuth, unchanged) and the
// project-content routes that render anonymously for a public project
// (outside RequireAuth, per D3).
export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeProjectId = useActiveProjectId()
  const projects = useProjectSummaries()
  const { user, loading, logout } = useAuth()
  // The switcher exists to jump between projects while inside one — it only
  // makes sense on a route that is actually about a specific project
  // (checked by route shape, not by whether resolution succeeded: a run
  // whose project lookup failed is still a project-scoped page and should
  // show "Select project", not hide the switcher outright).
  const isProjectScopedPage = /^\/(projects|runs)\//.test(location.pathname)
  // The landing page shows the project's own name as its heading right
  // below the header (ProjectPage.tsx) — the header chip would be a third
  // repeat there, so it's suppressed on this one route; the chip's switch
  // affordance moves to a chevron fused onto that heading instead.
  const isProjectLandingPage = /^\/projects\/[^/]+\/?$/.test(location.pathname)
  // Tenant-Admin-only instance settings (People/Roles) aren't project-scoped
  // either, but "Select project" is actively wrong there — there's nothing
  // to select. /settings/tokens is deliberately excluded: it's personal
  // (every user's own API tokens), not an admin concern.
  const isAdminSettingsPage = /^\/settings\/(people|roles|instance)(\/|$)/.test(location.pathname)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <ProjectSwitcherProvider projects={projects} onSelectProject={(id) => navigate(`/projects/${id}`)}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-baseline gap-1.5 sm:gap-2">
              {/* Matches assets/brand/testpulse-icon.svg (icon tile, EKG
                  stroke) and testpulse-logo-horizontal.svg (Test/Pulse color
                  split) — the header brand mark previously matched neither. */}
              {/* -ml-5: a partial hanging indent — pulling the icon fully
                  flush with the page content below it clipped it against the
                  header's own padding, so this closes most (not all) of the
                  gap between the icon's edge and the wordmark text's edge.
                  Left ~4px of breathing room from the true viewport edge
                  rather than going fully flush (0px), which read as too
                  tight at full page width. */}
              {/* text-[24px]: Recursive Variable renders more compact per
                  font-size unit than Geist, so at this size the wordmark's
                  rendered box height already lands close to the project
                  name's own bumped size below (ProjectSwitcher.tsx) — the
                  lead comes from color/weight, not from the wordmark
                  dwarfing the project name. */}
              <Link to="/" className="-ml-5 flex shrink-0 items-center gap-1.5 text-[24px] leading-none">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 200 200"
                  className="size-[26px] shrink-0 rounded-[5px]"
                >
                  <rect x="0" y="0" width="200" height="200" rx="44" ry="44" fill="url(#tp-wordmark-gradient)" />
                  <defs>
                    <linearGradient id="tp-wordmark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#14B8A6" />
                      <stop offset="100%" stopColor="#0D6E6A" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M35,112 L62,112 L78,74 L94,140 L112,112 L122,112 L138,130 L172,64"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={14}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  <span className="text-foreground tp-wordmark-test">Test</span>
                  <span className="text-primary tp-wordmark-pulse">Pulse</span>
                </span>
              </Link>
              {(isProjectScopedPage || isAdminSettingsPage) && !isProjectLandingPage && (
                <>
                  {/* text-[20px] + relative -top-1.5: sized up to match the
                      now-larger wordmark/project name either side of it.
                      Verified against getBoundingClientRect() center, not
                      just a visual glance — a smaller crop had made an
                      earlier (wrong-direction) offset look aligned when it
                      measured 10px off. */}
                  <span
                    aria-hidden="true"
                    className="relative -top-1.5 font-mono text-[20px] text-muted-foreground"
                  >
                    ›
                  </span>
                  {isAdminSettingsPage ? (
                    <span className="relative -top-1 truncate text-[20px] leading-none font-bold text-muted-foreground">
                      Administration
                    </span>
                  ) : (
                    <ProjectSwitcher
                      projects={projects}
                      activeProjectId={activeProjectId}
                      onSelectProject={(id) => navigate(`/projects/${id}`)}
                    />
                  )}
                </>
              )}
            </div>
            {user && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {user.isTenantAdmin && <AdminMenu />}
                <UserMenu user={user} onLogout={() => void handleLogout()} />
              </div>
            )}
            {!user && !loading && (
              <Link to="/login" state={{ from: location.pathname }} className="text-sm text-muted-foreground hover:text-foreground">
                Log in
              </Link>
            )}
          </div>
          {/* Anonymous-viewer banner (design.md D5) — moved here from the
              now-retired PublicHeader.tsx so every project-content route
              (not just the old standalone public page) carries it when
              there's no session. */}
          {!user && !loading && (
            <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-2 text-sm text-muted-foreground sm:px-6">
              <span>
                You&apos;re viewing this without an account. Some actions (editing, running tests, commenting) require
                signing in.
              </span>
            </div>
          )}
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
        <footer className="flex justify-center border-t px-4 py-3 sm:px-6">
          <HealthBadge />
        </footer>
      </div>
    </ProjectSwitcherProvider>
  )
}
