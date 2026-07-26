import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeftRight } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

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

export function ProjectSwitcher({ projects, activeProjectId, onSelectProject }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const activeProject = projects.find((p) => p.id === activeProjectId)
  // Nothing to jump to with 0-1 projects — the icon would just be noise.
  const canSwitch = projects.length > 1

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
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
    <>
      <div className="flex min-w-0 max-w-[9rem] items-center gap-0.5 sm:max-w-[16rem]">
        {activeProject ? (
          <Link
            to={`/projects/${activeProject.id}`}
            // text-[20px]: bumped from the base text-sm (14px) so the
            // project name reads closer to the wordmark's own presence,
            // rather than looking like an afterthought next to it.
            // leading-none + relative -top-1: Geist Variable's line-box
            // sits noticeably lower/taller than Recursive's at a similar
            // font-size, so items-baseline alone (App.tsx) wasn't enough
            // once the two were closer in size — calibrated live against
            // the wordmark next to it.
            className="relative -top-1 -mx-1 -my-1 min-w-0 truncate rounded-md px-1 py-1 text-[20px] leading-none font-bold text-foreground hover:text-primary hover:underline"
          >
            {activeProject.name}
          </Link>
        ) : (
          <span className="relative -top-1 truncate text-[20px] leading-none font-bold text-muted-foreground">
            Select project
          </span>
        )}
        {canSwitch && (
          // relative -top-0.5: sized up alongside the wordmark/project name
          // bumps above; a plain button's own alignment sat a touch low
          // next to the now-larger text, calibrated live.
          <button
            type="button"
            className="relative -top-0.5 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary"
            onClick={() => setOpen(true)}
            title="Switch project (⌘K)"
            aria-label="Switch project"
          >
            <ArrowLeftRight className="size-[22px]" />
          </button>
        )}
      </div>

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
    </>
  )
}
