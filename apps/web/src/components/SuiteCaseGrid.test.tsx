import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuiteCaseGrid, type SuiteCaseGridCase, type SuiteCaseGridFolder } from './SuiteCaseGrid'

// Picker mechanics (section-tree scoping, search, filters, virtualization,
// selection persistence) are covered by CasePicker.test.tsx — SuiteCaseGrid
// is now a thin wrapper (CasePicker + a commit footer), so its own tests
// cover only that composition and the footer itself.

const folders: SuiteCaseGridFolder[] = [
  { id: 'root', name: 'Library', parentFolderId: undefined },
  { id: 'auth', name: 'Auth', parentFolderId: 'root' },
]

const cases: SuiteCaseGridCase[] = [
  { id: 'c1', title: 'Login succeeds', tags: ['auth', 'smoke'], priority: 'high', platform: 'web', testType: 'functional', folderId: 'auth' },
  { id: 'c2', title: 'Login fails for wrong password', tags: ['auth', 'negative'], priority: 'high', platform: 'web', testType: 'functional', folderId: 'auth' },
]

function renderGrid(overrides: Partial<Parameters<typeof SuiteCaseGrid>[0]> = {}) {
  const onToggle = vi.fn()
  const onCommit = vi.fn()
  const onExit = vi.fn()
  render(
    <SuiteCaseGrid
      cases={cases}
      folders={folders}
      selected={new Set()}
      onToggle={onToggle}
      commitLabel="Create suite (0)"
      commitDisabled
      onCommit={onCommit}
      onExit={onExit}
      {...overrides}
    />,
  )
  return { onToggle, onCommit, onExit }
}

describe('SuiteCaseGrid', () => {
  it('renders the picker, wiring cases/folders/selection through', () => {
    renderGrid({ selected: new Set(['c2']) })
    expect(screen.getByRole('checkbox', { name: /login fails/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).not.toBeChecked()
  })

  it('calls onToggle with the case id when its checkbox is clicked', async () => {
    const { onToggle } = renderGrid()
    await userEvent.click(screen.getByRole('checkbox', { name: /login succeeds/i }))
    expect(onToggle).toHaveBeenCalledWith('c1')
  })

  it('shows "No cases selected" when the selection is empty', () => {
    renderGrid()
    expect(screen.getByText('No cases selected')).toBeInTheDocument()
  })

  it('shows a selection count in the footer, independent of the filtered row count', () => {
    renderGrid({ selected: new Set(['c1', 'c2']) })
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('renders the commit button with the given label and disabled state', () => {
    renderGrid({ commitLabel: 'Create suite (2)', commitDisabled: false })
    expect(screen.getByRole('button', { name: 'Create suite (2)' })).toBeEnabled()
  })

  it('calls onCommit when the commit button is clicked', async () => {
    const { onCommit } = renderGrid({ commitLabel: 'Save changes', commitDisabled: false })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onCommit).toHaveBeenCalled()
  })

  // Permission-gating retrofit (unify-authenticated-and-public-views
  // tasks.md 2.2): SuiteDetailPage uses this grid as its case list, so a
  // caller lacking suiteEditMembership must see the cases with no editing
  // affordance at all — checkboxes disabled, no selection-count/commit
  // footer (there's nothing to commit if you can't edit).
  it('disables checkboxes and hides the selection/commit footer when readOnly', () => {
    renderGrid({ readOnly: true, selected: new Set(['c1']) })
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeDisabled()
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create suite|save changes/i })).not.toBeInTheDocument()
  })

  it('shows a lone "Done" control when readOnly, calling onExit when clicked', async () => {
    const { onExit } = renderGrid({ readOnly: true })
    const doneButton = screen.getByRole('button', { name: /^done$/i })
    await userEvent.click(doneButton)
    expect(onExit).toHaveBeenCalled()
  })

  it('shows a "Cancel" control alongside the commit button when editable, calling onExit when clicked', async () => {
    const { onExit, onCommit } = renderGrid({ commitLabel: 'Save changes', commitDisabled: false })
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onExit).toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })
})
