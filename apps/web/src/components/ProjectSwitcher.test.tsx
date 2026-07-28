import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ProjectSwitcher, type SwitcherProject } from './ProjectSwitcher'
import { ProjectSwitcherProvider } from '@/lib/useProjectSwitcher'

const projects: SwitcherProject[] = [
  { id: 'p1', name: 'Banca Móvil', suiteCount: 7, caseCount: 51, passRate: 78 },
  { id: 'p2', name: 'Desktop App', suiteCount: 3, caseCount: 20, passRate: null },
]

function renderSwitcher(
  props: Partial<React.ComponentProps<typeof ProjectSwitcher>> & { onSelectProject?: (id: string) => void } = {},
) {
  const { onSelectProject = vi.fn(), ...switcherProps } = props
  const list = switcherProps.projects ?? projects
  return render(
    <MemoryRouter>
      <ProjectSwitcherProvider projects={list} onSelectProject={onSelectProject}>
        <ProjectSwitcher projects={list} onSelectProject={onSelectProject} {...switcherProps} />
      </ProjectSwitcherProvider>
    </MemoryRouter>,
  )
}

describe('ProjectSwitcher', () => {
  describe('multiple projects — name+caret trigger', () => {
    it('renders the active project name as a link to its own page, separate from the caret', () => {
      renderSwitcher({ activeProjectId: 'p1' })
      const link = screen.getByRole('link', { name: 'Banca Móvil' })
      expect(link).toHaveAttribute('href', '/projects/p1')
      expect(screen.getByRole('button', { name: /switch project/i })).toBeInTheDocument()
    })

    it('clicking the name navigates directly — it does not open the switcher', async () => {
      const user = userEvent.setup()
      renderSwitcher({ activeProjectId: 'p1' })
      await user.click(screen.getByRole('link', { name: 'Banca Móvil' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('never wraps or grows unbounded for a long project name — truncates instead', () => {
      renderSwitcher({
        projects: [
          { id: 'p1', name: 'A Very Long Project Name That Should Not Wrap', suiteCount: 0, caseCount: 0, passRate: null },
          { id: 'p2', name: 'Desktop App', suiteCount: 3, caseCount: 20, passRate: null },
        ],
        activeProjectId: 'p1',
      })
      const label = screen.getByText('A Very Long Project Name That Should Not Wrap')
      expect(label).toHaveClass('truncate')
    })

    it('clicking the caret opens an anchored popover, not the project link', async () => {
      const user = userEvent.setup()
      renderSwitcher({ activeProjectId: 'p1' })
      await user.click(screen.getByRole('button', { name: /switch project/i }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('closes the popover on Escape', async () => {
      const user = userEvent.setup()
      renderSwitcher({ activeProjectId: 'p1' })
      await user.click(screen.getByRole('button', { name: /switch project/i }))
      await screen.findByRole('dialog')
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes the popover on an outside click', async () => {
      const user = userEvent.setup()
      renderSwitcher({ activeProjectId: 'p1' })
      await user.click(screen.getByRole('button', { name: /switch project/i }))
      await screen.findByRole('dialog')
      await user.click(document.body)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('single project — plain text', () => {
    it('renders the project name as a plain link with no caret', () => {
      renderSwitcher({
        projects: [{ id: 'p1', name: 'Banca Móvil', suiteCount: 7, caseCount: 51, passRate: 78 }],
        activeProjectId: 'p1',
      })
      expect(screen.getByRole('link', { name: 'Banca Móvil' })).toHaveAttribute('href', '/projects/p1')
      expect(screen.queryByRole('button', { name: /switch project/i })).not.toBeInTheDocument()
    })

    it('hides the caret when there are no projects at all', () => {
      renderSwitcher({ projects: [] })
      expect(screen.queryByRole('button', { name: /switch project/i })).not.toBeInTheDocument()
    })

    it('shows a placeholder label, not a link, when no project is active', () => {
      renderSwitcher()
      expect(screen.getByText('Select project')).toBeInTheDocument()
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
  })

  describe('switcher popover', () => {
    it('opens the palette with every project and its stats when the caret is clicked', async () => {
      const user = userEvent.setup()
      renderSwitcher({ activeProjectId: 'p1' })
      await user.click(screen.getByRole('button', { name: /switch project/i }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Banca Móvil')).toBeInTheDocument()
      expect(within(dialog).getByText(/7 suites/)).toBeInTheDocument()
      expect(within(dialog).getByText(/51 cases/)).toBeInTheDocument()
      expect(within(dialog).getByText(/78%/)).toBeInTheDocument()
      expect(within(dialog).getByText('Desktop App')).toBeInTheDocument()
      expect(within(dialog).getByText(/no runs/i)).toBeInTheDocument()
    })

    it('shows a project name and its stats on separate lines in the search list, so long names never crowd the stats', async () => {
      const user = userEvent.setup()
      renderSwitcher({
        projects: [
          { id: 'p1', name: 'Version History Project 1784040597335-x5tn7', suiteCount: 0, caseCount: 1, passRate: null },
          { id: 'p2', name: 'Desktop App', suiteCount: 3, caseCount: 20, passRate: null },
        ],
        activeProjectId: 'p2',
      })
      await user.click(screen.getByRole('button', { name: /switch project/i }))
      const dialog = await screen.findByRole('dialog')

      const name = within(dialog).getByText('Version History Project 1784040597335-x5tn7')
      expect(name).toHaveClass('truncate')
      expect(name).toHaveClass('block')
      const stats = within(dialog).getByText(/0 suites/)
      expect(stats).toHaveClass('block')
    })

    it('does not render a close (×) button on the popover — dismiss via Escape or an outside click, like a command palette', async () => {
      const user = userEvent.setup()
      renderSwitcher({ activeProjectId: 'p1' })
      await user.click(screen.getByRole('button', { name: /switch project/i }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
    })

    it('opens the palette via the keyboard shortcut from anywhere', async () => {
      const user = userEvent.setup()
      renderSwitcher({ activeProjectId: 'p1' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await user.keyboard('{Meta>}k{/Meta}')
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('filters the project list as the user types', async () => {
      const user = userEvent.setup()
      renderSwitcher({ activeProjectId: 'p1' })
      await user.click(screen.getByRole('button', { name: /switch project/i }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByRole('textbox'), 'desktop')
      expect(within(dialog).getByText('Desktop App')).toBeInTheDocument()
      expect(within(dialog).queryByText('Banca Móvil')).not.toBeInTheDocument()
    })

    it('selects a project and closes the palette', async () => {
      const user = userEvent.setup()
      const onSelectProject = vi.fn()
      renderSwitcher({ activeProjectId: 'p1', onSelectProject })
      await user.click(screen.getByRole('button', { name: /switch project/i }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByText('Desktop App'))
      expect(onSelectProject).toHaveBeenCalledWith('p2')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
