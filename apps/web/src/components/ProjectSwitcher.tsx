import { useEffect, useMemo, useState } from 'react'
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
      <button
        type="button"
        className="flex max-w-[9rem] items-center gap-2 rounded-md border px-3 py-1.5 text-sm sm:max-w-[16rem]"
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{activeProject?.name ?? 'Select project'}</span>
        <span className="shrink-0 text-muted-foreground">▾</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
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
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onSelectProject(p.id)
                    setOpen(false)
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
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
