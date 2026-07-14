import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectSwitcher, type SwitcherProject } from './ProjectSwitcher'

const projects: SwitcherProject[] = [
  { id: 'p1', name: 'Banca Móvil', suiteCount: 7, caseCount: 51, passRate: 78 },
  { id: 'p2', name: 'Desktop App', suiteCount: 3, caseCount: 20, passRate: null },
]

describe('ProjectSwitcher', () => {
  it('shows the active project name on the trigger', () => {
    render(
      <ProjectSwitcher projects={projects} activeProjectId="p1" onSelectProject={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /Banca Móvil/ })).toBeInTheDocument()
  })

  it('never wraps or grows unbounded for a long project name — truncates instead', () => {
    render(
      <ProjectSwitcher
        projects={[{ id: 'p1', name: 'A Very Long Project Name That Should Not Wrap', suiteCount: 0, caseCount: 0, passRate: null }]}
        activeProjectId="p1"
        onSelectProject={vi.fn()}
      />,
    )
    const label = screen.getByText('A Very Long Project Name That Should Not Wrap')
    expect(label).toHaveClass('truncate')
  })

  it('shows a placeholder label when no project is active', () => {
    render(<ProjectSwitcher projects={projects} onSelectProject={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Select project/ })).toBeInTheDocument()
  })

  it('opens the palette with every project and its stats when clicked', async () => {
    const user = userEvent.setup()
    render(
      <ProjectSwitcher projects={projects} activeProjectId="p1" onSelectProject={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: /Banca Móvil/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Banca Móvil')).toBeInTheDocument()
    expect(within(dialog).getByText(/7 suites/)).toBeInTheDocument()
    expect(within(dialog).getByText(/51 cases/)).toBeInTheDocument()
    expect(within(dialog).getByText(/78%/)).toBeInTheDocument()
    expect(within(dialog).getByText('Desktop App')).toBeInTheDocument()
    expect(within(dialog).getByText(/no runs/i)).toBeInTheDocument()
  })

  it('opens the palette via the keyboard shortcut from anywhere', async () => {
    const user = userEvent.setup()
    render(
      <ProjectSwitcher projects={projects} activeProjectId="p1" onSelectProject={vi.fn()} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('filters the project list as the user types', async () => {
    const user = userEvent.setup()
    render(
      <ProjectSwitcher projects={projects} activeProjectId="p1" onSelectProject={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: /Banca Móvil/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), 'desktop')
    expect(within(dialog).getByText('Desktop App')).toBeInTheDocument()
    expect(within(dialog).queryByText('Banca Móvil')).not.toBeInTheDocument()
  })

  it('selects a project and closes the palette', async () => {
    const user = userEvent.setup()
    const onSelectProject = vi.fn()
    render(
      <ProjectSwitcher projects={projects} activeProjectId="p1" onSelectProject={onSelectProject} />,
    )
    await user.click(screen.getByRole('button', { name: /Banca Móvil/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByText('Desktop App'))
    expect(onSelectProject).toHaveBeenCalledWith('p2')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
