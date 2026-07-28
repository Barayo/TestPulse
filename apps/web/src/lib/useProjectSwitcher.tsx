import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { SwitcherProject } from '@/components/ProjectSwitcher'

type ProjectSwitcherContextValue = {
  canSwitch: boolean
  openSwitcher: () => void
  // The top-bar trigger (ProjectSwitcher.tsx) manages its own anchored
  // popover rather than this shared centered dialog — it registers itself
  // as ⌘K's target whenever it's mounted (every project-scoped page except
  // the landing page, where only the h1-fused chevron exists and calls
  // openSwitcher directly).
  registerPopoverOpener: (fn: (() => void) | null) => void
}

const ProjectSwitcherContext = createContext<ProjectSwitcherContextValue>({
  canSwitch: false,
  openSwitcher: () => {},
  registerPopoverOpener: () => {},
})

export function useProjectSwitcher(): ProjectSwitcherContextValue {
  return useContext(ProjectSwitcherContext)
}

type ProviderProps = {
  projects: SwitcherProject[]
  onSelectProject: (projectId: string) => void
  children: ReactNode
}

// Dialog, open state, and the ⌘K shortcut used to live inside the header
// chip (ProjectSwitcher.tsx) itself. Pulled out here (rework-project-nav-identity)
// so they stay mounted regardless of route — the project landing page no
// longer renders the chip at all, but ⌘K and the fused-h1 chevron there
// both still need to open the same switcher.
export function ProjectSwitcherProvider({ projects, onSelectProject, children }: ProviderProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Nothing to jump to with 0-1 projects — no affordance should imply one.
  const canSwitch = projects.length > 1
  const popoverOpenerRef = useRef<(() => void) | null>(null)

  const registerPopoverOpener = useCallback((fn: (() => void) | null) => {
    popoverOpenerRef.current = fn
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (popoverOpenerRef.current) popoverOpenerRef.current()
        else setOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  )

  return (
    <ProjectSwitcherContext.Provider value={{ canSwitch, openSwitcher: () => setOpen(true), registerPopoverOpener }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogTitle className="sr-only">Switch project</DialogTitle>
          <Input
            autoFocus
            placeholder="Search projects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="max-h-80 space-y-1 overflow-y-auto">
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
                    {p.suiteCount} suites · {p.caseCount} cases ·{' '}
                    {p.passRate === null ? 'no runs' : `${p.passRate}% pass`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </ProjectSwitcherContext.Provider>
  )
}
