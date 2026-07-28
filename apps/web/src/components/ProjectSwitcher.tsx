import { Link } from 'react-router'
import { ChevronDown } from 'lucide-react'
import { avatarStyle, initialsFor } from '@/lib/avatar'
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
}

export function ProjectSwitcher({ projects, activeProjectId }: Props) {
  const { canSwitch, openSwitcher } = useProjectSwitcher()
  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <div className="flex min-w-0 max-w-[9rem] items-center sm:max-w-[16rem]">
      {activeProject && canSwitch ? (
        // Fused chip (rework-project-nav-identity): avatar + name + chevron
        // share one visual container — hovering anywhere in it (including
        // over the link or the button) highlights the whole thing as one
        // unit, replacing the earlier bare name + separate floating
        // ArrowLeftRight icon that read as two loose pieces.
        <div
          data-testid="project-chip"
          className="flex min-w-0 items-center gap-1.5 rounded-md py-1 pr-1 pl-1.5 hover:bg-accent"
        >
          <Link to={`/projects/${activeProject.id}`} className="flex min-w-0 items-center gap-1.5 rounded-sm">
            <span
              aria-hidden="true"
              style={avatarStyle(activeProject.name)}
              className="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-[9.5px] font-extrabold"
            >
              {initialsFor(activeProject.name)}
            </span>
            <span className="min-w-0 truncate text-[16.5px] leading-none font-bold text-foreground">
              {activeProject.name}
            </span>
          </Link>
          <button
            type="button"
            className="flex shrink-0 items-center justify-center text-muted-foreground hover:text-primary"
            onClick={openSwitcher}
            title="Switch project (⌘K)"
            aria-label="Switch project"
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : activeProject ? (
        // Single project: plain link, no chip chrome (avatar/pill/chevron)
        // — nothing suggesting a switch affordance that has nothing to
        // switch to, but "go to this project" is still real navigation.
        <Link
          to={`/projects/${activeProject.id}`}
          className="relative -top-1 -mx-1 -my-1 min-w-0 truncate rounded-md px-1 py-1 text-[20px] leading-none font-bold text-foreground hover:text-primary hover:underline"
        >
          {activeProject.name}
        </Link>
      ) : (
        <span className="relative -top-1 truncate text-[20px] leading-none font-bold text-muted-foreground">
          Select project
        </span>
      )}
    </div>
  )
}
