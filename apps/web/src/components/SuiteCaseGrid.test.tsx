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
  render(
    <SuiteCaseGrid
      cases={cases}
      folders={folders}
      selected={new Set()}
      onToggle={onToggle}
      commitLabel="Create suite (0)"
      commitDisabled
      onCommit={onCommit}
      {...overrides}
    />,
  )
  return { onToggle, onCommit }
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
})
