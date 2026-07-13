import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuiteDrawer } from './SuiteDrawer'

const availableCases = [
  { id: 'c1', title: 'Login works' },
  { id: 'c2', title: 'Logout works' },
]

describe('SuiteDrawer', () => {
  it('shows the suite name, case count, and its member cases', () => {
    render(
      <SuiteDrawer
        open
        suiteName="Smoke"
        memberCases={[{ id: 'c1', title: 'Login works' }]}
        availableCases={availableCases}
        onClose={vi.fn()}
        onAddCase={vi.fn()}
        onRemoveCase={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Smoke' })).toBeInTheDocument()
    expect(screen.getByText(/1 case/i)).toBeInTheDocument()
    expect(screen.getByText('Login works')).toBeInTheDocument()
  })

  it('shows empty-membership copy when the suite has no cases yet', () => {
    render(
      <SuiteDrawer
        open
        suiteName="Smoke"
        memberCases={[]}
        availableCases={availableCases}
        onClose={vi.fn()}
        onAddCase={vi.fn()}
        onRemoveCase={vi.fn()}
      />,
    )
    expect(screen.getByText(/no cases yet/i)).toBeInTheDocument()
  })

  it('removes a member case', async () => {
    const onRemoveCase = vi.fn()
    render(
      <SuiteDrawer
        open
        suiteName="Smoke"
        memberCases={[{ id: 'c1', title: 'Login works' }]}
        availableCases={availableCases}
        onClose={vi.fn()}
        onAddCase={vi.fn()}
        onRemoveCase={onRemoveCase}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /remove login works/i }))
    expect(onRemoveCase).toHaveBeenCalledWith('c1')
  })

  it('adds a case picked via search from the cases not yet in the suite', async () => {
    const onAddCase = vi.fn()
    render(
      <SuiteDrawer
        open
        suiteName="Smoke"
        memberCases={[{ id: 'c1', title: 'Login works' }]}
        availableCases={availableCases}
        onClose={vi.fn()}
        onAddCase={onAddCase}
        onRemoveCase={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /add case/i }))
    await userEvent.click(await screen.findByText('Logout works'))
    expect(onAddCase).toHaveBeenCalledWith('c2')
  })

  it('does not offer an already-member case in the add picker', async () => {
    render(
      <SuiteDrawer
        open
        suiteName="Smoke"
        memberCases={[{ id: 'c1', title: 'Login works' }]}
        availableCases={availableCases}
        onClose={vi.fn()}
        onAddCase={vi.fn()}
        onRemoveCase={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /add case/i }))
    const dialog = await screen.findByRole('dialog', { name: /add a case/i })
    expect(within(dialog).queryByText('Login works')).not.toBeInTheDocument()
  })

  it('calls onClose when Close is clicked', async () => {
    const onClose = vi.fn()
    render(
      <SuiteDrawer
        open
        suiteName="Smoke"
        memberCases={[]}
        availableCases={availableCases}
        onClose={onClose}
        onAddCase={vi.fn()}
        onRemoveCase={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    render(
      <SuiteDrawer
        open={false}
        suiteName="Smoke"
        memberCases={[]}
        availableCases={availableCases}
        onClose={vi.fn()}
        onAddCase={vi.fn()}
        onRemoveCase={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
