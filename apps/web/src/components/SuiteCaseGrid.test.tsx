import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuiteCaseGrid, computeVisibleRange, type SuiteCaseGridCase, type SuiteCaseGridFolder } from './SuiteCaseGrid'

const folders: SuiteCaseGridFolder[] = [
  { id: 'root', name: 'Library', parentFolderId: undefined },
  { id: 'auth', name: 'Auth', parentFolderId: 'root' },
  { id: 'checkout', name: 'Checkout', parentFolderId: 'root' },
  { id: 'checkout-payments', name: 'Payments', parentFolderId: 'checkout' },
]

const cases: SuiteCaseGridCase[] = [
  { id: 'c1', title: 'Login succeeds', tags: ['auth', 'smoke'], priority: 'high', platform: 'web', testType: 'functional', folderId: 'auth' },
  { id: 'c2', title: 'Login fails for wrong password', tags: ['auth', 'negative'], priority: 'high', platform: 'web', testType: 'functional', folderId: 'auth' },
  { id: 'c3', title: 'Checkout completes with a valid card', tags: ['checkout'], priority: 'critical', platform: 'mobile', testType: 'e2e', folderId: 'checkout-payments' },
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

  // --- section-tree scoping (rework-suite-case-picker-scale) ---

  it('shows a section tree with an "All sections" entry selected by default', () => {
    renderGrid()
    const tree = screen.getByRole('tree', { name: /sections/i })
    expect(within(tree).getByText(/all sections/i)).toBeInTheDocument()
    expect(within(tree).getByText('Auth')).toBeInTheDocument()
    expect(within(tree).getByText('Checkout')).toBeInTheDocument()
  })

  it('scoping to a section narrows the list to that section and its descendants', async () => {
    renderGrid()
    await userEvent.click(screen.getByRole('treeitem', { name: /checkout/i }))
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
    // c3 lives in "Payments", a descendant of "Checkout" — must still show.
    expect(screen.getByText('Checkout completes with a valid card')).toBeInTheDocument()
  })

  it('"All sections" clears the scope back to everything', async () => {
    renderGrid()
    await userEvent.click(screen.getByRole('treeitem', { name: /checkout/i }))
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('treeitem', { name: /all sections/i }))
    expect(screen.getByText('Login succeeds')).toBeInTheDocument()
  })

  it('selection survives a scope change', async () => {
    renderGrid({ selected: new Set(['c1']) })
    await userEvent.click(screen.getByRole('treeitem', { name: /checkout/i }))
    expect(screen.queryByRole('checkbox', { name: /login succeeds/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('treeitem', { name: /all sections/i }))
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeChecked()
  })

  // --- search (rework-suite-case-picker-scale) ---

  it('search narrows the list by title substring', async () => {
    renderGrid()
    await userEvent.type(screen.getByRole('textbox', { name: /search case titles/i }), 'checkout')
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
    expect(screen.getByText('Checkout completes with a valid card')).toBeInTheDocument()
  })

  it('search composes with an active section scope', async () => {
    renderGrid()
    await userEvent.click(screen.getByRole('treeitem', { name: /^auth/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /search case titles/i }), 'wrong password')
    expect(screen.getByText('Login fails for wrong password')).toBeInTheDocument()
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
  })

  it('selection survives a search change', async () => {
    renderGrid({ selected: new Set(['c1']) })
    await userEvent.type(screen.getByRole('textbox', { name: /search case titles/i }), 'checkout')
    expect(screen.queryByRole('checkbox', { name: /login succeeds/i })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByRole('textbox', { name: /search case titles/i }))
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeChecked()
  })

  // --- "Selected only" toggle ---

  it('"Selected only" shows just the checked cases, across sections', async () => {
    renderGrid({ selected: new Set(['c1', 'c3']) })
    await userEvent.click(screen.getByRole('button', { name: /selected only/i }))
    expect(screen.getByText('Login succeeds')).toBeInTheDocument()
    expect(screen.getByText('Checkout completes with a valid card')).toBeInTheDocument()
    expect(screen.queryByText('Login fails for wrong password')).not.toBeInTheDocument()
  })

  it('section tree items are keyboard-activatable with Enter and Space', async () => {
    renderGrid()
    const checkoutItem = screen.getByRole('treeitem', { name: /^checkout/i })
    checkoutItem.focus()
    fireEvent.keyDown(checkoutItem, { key: 'Enter' })
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()

    const allSectionsItem = screen.getByRole('treeitem', { name: /^all sections/i })
    allSectionsItem.focus()
    fireEvent.keyDown(allSectionsItem, { key: ' ' })
    expect(screen.getByText('Login succeeds')).toBeInTheDocument()
  })

  it('collapses and reopens the section rail', async () => {
    renderGrid()
    expect(screen.getByRole('tree', { name: /sections/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^hide$/i }))
    expect(screen.queryByRole('tree', { name: /sections/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /show sections/i }))
    expect(screen.getByRole('tree', { name: /sections/i })).toBeInTheDocument()
  })

  // --- bounded rendering at scale ---

  it('renders a bounded number of DOM rows regardless of how many cases match', () => {
    const many: SuiteCaseGridCase[] = Array.from({ length: 200 }, (_, i) => ({
      id: `bulk-${i}`,
      title: `Bulk case ${i}`,
      tags: [],
      priority: '',
      platform: '',
      testType: '',
      folderId: 'auth',
    }))
    renderGrid({ cases: many, selected: new Set() })
    const rendered = screen.getAllByRole('checkbox')
    expect(rendered.length).toBeLessThan(40)
    expect(rendered.length).toBeGreaterThan(0)
  })

  it('renders the correct rows after scrolling, not blank recycled rows', () => {
    const many: SuiteCaseGridCase[] = Array.from({ length: 200 }, (_, i) => ({
      id: `bulk-${i}`,
      title: `Bulk case ${i}`,
      tags: [],
      priority: '',
      platform: '',
      testType: '',
      folderId: 'auth',
    }))
    renderGrid({ cases: many, selected: new Set() })
    const viewport = screen.getByTestId('suite-case-grid-viewport')
    // 11560px = (200 rows × 60px) - 440px viewport — the real max scrollTop a
    // browser would ever deliver for this content; jsdom doesn't clamp on its
    // own, so the test supplies a realistic value rather than an impossible one.
    fireEvent.scroll(viewport, { target: { scrollTop: 11560 } })
    expect(screen.getByText('Bulk case 199')).toBeInTheDocument()
  })

  it('caps tags at 2 with an overflow badge', () => {
    const withManyTags: SuiteCaseGridCase[] = [
      { id: 'c1', title: 'Many tags case', tags: ['a', 'b', 'c', 'd'], priority: '', platform: '', testType: '', folderId: 'auth' },
    ]
    renderGrid({ cases: withManyTags })
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.queryByText('c')).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })
})

describe('computeVisibleRange', () => {
  // viewportHeight=440, rowHeight=60 → ceil(440/60)=8 rows fit, +2×overscan(6)=12 → a 20-row window.
  it('returns the range from the top when scrollTop is 0', () => {
    expect(computeVisibleRange(0, 440, 60, 200, 6)).toEqual({ start: 0, end: 20 })
  })

  it('clamps the start to 0 near the top even when overscan would go negative', () => {
    // floor(120/60)=2, minus overscan 6 = -4 → clamped to 0, not a negative index.
    expect(computeVisibleRange(120, 440, 60, 200, 6)).toEqual({ start: 0, end: 20 })
  })

  it('advances the range as scrollTop increases', () => {
    // floor(3000/60)=50; overscan pulls start back by 6 rows to 44.
    expect(computeVisibleRange(3000, 440, 60, 200, 6)).toEqual({ start: 44, end: 64 })
  })

  it('clamps the end to the total row count near the bottom', () => {
    // 11560 = (200×60) - 440, the real max scrollTop for this content.
    expect(computeVisibleRange(11560, 440, 60, 200, 6)).toEqual({ start: 186, end: 200 })
  })

  it('returns an empty range for zero total rows', () => {
    expect(computeVisibleRange(0, 440, 60, 0, 6)).toEqual({ start: 0, end: 0 })
  })
})
