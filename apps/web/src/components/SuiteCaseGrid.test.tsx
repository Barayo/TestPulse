import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuiteCaseGrid, type SuiteCaseGridCase } from './SuiteCaseGrid'

const cases: SuiteCaseGridCase[] = [
  { id: 'c1', title: 'Login succeeds', tags: ['auth', 'smoke'], priority: 'high', platform: 'web', testType: 'functional' },
  { id: 'c2', title: 'Login fails for wrong password', tags: ['auth', 'negative'], priority: 'high', platform: 'web', testType: 'functional' },
  { id: 'c3', title: 'Checkout completes with a valid card', tags: ['checkout'], priority: 'critical', platform: 'mobile', testType: 'e2e' },
]

function renderGrid(overrides: Partial<Parameters<typeof SuiteCaseGrid>[0]> = {}) {
  const onToggle = vi.fn()
  const onCommit = vi.fn()
  render(
    <SuiteCaseGrid
      cases={cases}
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
  it('renders one row per case, unchecked by default', () => {
    renderGrid()
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /checkout completes/i })).not.toBeChecked()
  })

  it('renders a case as checked when its id is in the selected set', () => {
    renderGrid({ selected: new Set(['c2']) })
    expect(screen.getByRole('checkbox', { name: /login fails/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).not.toBeChecked()
  })

  it('calls onToggle with the case id when its checkbox is clicked', async () => {
    const { onToggle } = renderGrid()
    await userEvent.click(screen.getByRole('checkbox', { name: /checkout completes/i }))
    expect(onToggle).toHaveBeenCalledWith('c3')
  })

  it('filters rows by platform without changing the selection', async () => {
    const { onToggle } = renderGrid({ selected: new Set(['c1']) })
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeChecked()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /platform/i }), 'mobile')
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
    expect(screen.getByText('Checkout completes with a valid card')).toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /platform/i }), '')
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeChecked()
  })

  it('platform and test type filters list only distinct values present in the cases prop', () => {
    renderGrid()
    const platformSelect = screen.getByRole('combobox', { name: /platform/i })
    const platformOptions = Array.from(platformSelect.querySelectorAll('option')).map((o) => o.textContent)
    expect(platformOptions).toEqual(['All platforms', 'Mobile', 'Web'])

    const typeSelect = screen.getByRole('combobox', { name: /test type/i })
    const typeOptions = Array.from(typeSelect.querySelectorAll('option')).map((o) => o.textContent)
    expect(typeOptions).toEqual(['All test types', 'E2e', 'Functional'])
  })

  it('shows an explicit empty state when no case matches the filters', async () => {
    renderGrid()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /platform/i }), 'web')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /test type/i }), 'e2e')
    expect(screen.getByText(/no cases match/i)).toBeInTheDocument()
  })

  it('shows a selection count independent of the filtered row count', async () => {
    renderGrid({ selected: new Set(['c1', 'c3']) })
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /platform/i }), 'web')
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument()
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
