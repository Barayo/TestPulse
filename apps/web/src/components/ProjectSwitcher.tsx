import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Input } from '@/components/ui/input'
import { useProjectSwitcher } from '@/lib/useProjectSwitcher'

export type SwitcherProject = {
  id: string
  name: string
  suiteCount: number
  caseCount: number
  passRate: number | null
}

type Props = {
  projects: SwitcherProject[]
  activeProjectId?: string
  onSelectProject: (projectId: string) => void
}

// Proposal C (Anchored Popover) — chosen over the earlier fused-chip
// proposal for its lighter resting-state chrome (no avatar, no pill
// background — just a caret) since switching projects is rare. The
// avatar+name/chevron split-click-target requirement carries over
// unchanged from that earlier pass: the name is always a real link to the
// project's own page, and only the caret opens the switcher — losing that
// distinction was a real regression the product owner caught once already.
export function ProjectSwitcher({ projects, activeProjectId, onSelectProject }: Props) {
  const { t } = useTranslation()
  const { canSwitch, registerPopoverOpener } = useProjectSwitcher()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const activeProject = projects.find((p) => p.id === activeProjectId)

  useEffect(() => {
    if (!canSwitch) return
    registerPopoverOpener(() => setOpen(true))
    return () => registerPopoverOpener(null)
  }, [canSwitch, registerPopoverOpener])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  )

  if (!activeProject) {
    return (
      <span className="relative -top-1 truncate text-[20px] leading-none font-bold text-muted-foreground">
        {t('ProjectSwitcher.selectProject')}
      </span>
    )
  }

  if (!canSwitch) {
    // Single project: genuinely plain text — no caret, no hover feedback at
    // all — since there's nothing to switch to and nothing should suggest
    // otherwise. Still a real link: going to the project itself is
    // ordinary navigation, not a switch affordance.
    return (
      <Link
        to={`/projects/${activeProject.id}`}
        className="relative -top-1 -mx-1 -my-1 min-w-0 truncate rounded-md px-1 py-1 text-[19px] leading-none font-bold text-foreground"
      >
        {activeProject.name}
      </Link>
    )
  }

  return (
    <div ref={containerRef} className="relative flex min-w-0 items-baseline">
      <Link
        to={`/projects/${activeProject.id}`}
        className="relative -top-1 min-w-0 max-w-[220px] truncate rounded-md px-1 py-1 text-[19px] leading-none font-bold text-foreground hover:bg-accent"
      >
        {activeProject.name}
      </Link>
      <button
        type="button"
        className="relative -top-1 flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-primary aria-expanded:text-primary"
        onClick={() => setOpen((o) => !o)}
        title={t('ProjectSwitcher.switchProjectTitle')}
        aria-label={t('ProjectSwitcher.switchProjectAriaLabel')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('ProjectSwitcher.switchProjectAriaLabel')}
          className="absolute top-[calc(100%+12px)] left-0 z-50 w-80 rounded-md border bg-card p-3 shadow-lg"
        >
          <Input
            autoFocus
            placeholder={t('ProjectSwitcher.searchProjectsPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="block w-full rounded-md px-2 py-2 text-left hover:bg-accent"
                  onClick={() => {
                    onSelectProject(p.id)
                    setOpen(false)
                  }}
                >
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {t('ProjectSwitcher.projectStats', {
                      suites: p.suiteCount,
                      cases: p.caseCount,
                      status: p.passRate === null ? t('ProjectSwitcher.noRuns') : t('ProjectSwitcher.passRateStatus', { rate: p.passRate }),
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
