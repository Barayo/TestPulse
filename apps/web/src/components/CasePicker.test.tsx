import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CasePicker, computeVisibleRange, type CasePickerCase, type CasePickerFolder } from './CasePicker'

const folders: CasePickerFolder[] = [
  { id: 'root', name: 'Library', parentFolderId: undefined },
  { id: 'auth', name: 'Auth', parentFolderId: 'root' },
  { id: 'checkout', name: 'Checkout', parentFolderId: 'root' },
  { id: 'checkout-payments', name: 'Payments', parentFolderId: 'checkout' },
]

const cases: CasePickerCase[] = [
  { id: 'c1', title: 'Login succeeds', tags: ['auth', 'smoke'], priority: 'high', platform: 'web', testType: 'functional', folderId: 'auth' },
  { id: 'c2', title: 'Login fails for wrong password', tags: ['auth', 'negative'], priority: 'high', platform: 'web', testType: 'functional', folderId: 'auth' },
  { id: 'c3', title: 'Checkout completes with a valid card', tags: ['checkout'], priority: 'critical', platform: 'mobile', testType: 'e2e', folderId: 'checkout-payments' },
]

function renderPicker(overrides: Partial<Parameters<typeof CasePicker>[0]> = {}) {
  const onToggle = vi.fn()
  const onToggleRange = vi.fn()
  render(
    <CasePicker
      cases={cases}
      folders={folders}
      selected={new Set()}
      onToggle={onToggle}
      onToggleRange={onToggleRange}
      {...overrides}
    />,
  )
  return { onToggle, onToggleRange }
}

describe('CasePicker resizable Sections rail (add-resizable-library-tree)', () => {
  it('renders the rail at a width-driven inline style, and a resize handle while expanded', () => {
    renderPicker()
    const rail = screen.getByRole('tree', { name: 'Sections' }).parentElement as HTMLElement
    expect(rail).toHaveStyle({ width: '224px' })
    expect(screen.getByRole('separator', { name: /resize section tree/i })).toBeInTheDocument()
  })

  it('hides the resize handle once the rail is collapsed', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /^hide$/i }))
    expect(screen.queryByRole('separator', { name: /resize section tree/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tree', { name: 'Sections' })).not.toBeInTheDocument()
  })
})

describe('CasePicker', () => {
  it('renders one row per case, unchecked by default', () => {
    renderPicker()
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /checkout completes/i })).not.toBeChecked()
  })

  it('renders a case as checked when its id is in the selected set', () => {
    renderPicker({ selected: new Set(['c2']) })
    expect(screen.getByRole('checkbox', { name: /login fails/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).not.toBeChecked()
  })

  it('calls onToggle with the case id when its checkbox is clicked', async () => {
    const { onToggle } = renderPicker()
    await userEvent.click(screen.getByRole('checkbox', { name: /checkout completes/i }))
    expect(onToggle).toHaveBeenCalledWith('c3')
  })

  // Permission-gating retrofit (unify-authenticated-and-public-views
  // tasks.md 2.2): SuiteDetailPage reuses this same picker as its case
  // list, so a caller lacking suiteEditMembership (including an anonymous
  // visitor) must see genuinely disabled checkboxes, not just a UI that
  // looks interactive and relies on the server 403.
  it('disables every checkbox and ignores clicks when readOnly is set', async () => {
    const { onToggle } = renderPicker({ readOnly: true })
    const checkbox = screen.getByRole('checkbox', { name: /checkout completes/i })
    expect(checkbox).toBeDisabled()
    await userEvent.click(checkbox)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('filters rows by platform without changing the selection', async () => {
    const { onToggle } = renderPicker({ selected: new Set(['c1']) })
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeChecked()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /platform/i }), 'mobile')
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
    expect(screen.getByText('Checkout completes with a valid card')).toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /platform/i }), '')
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeChecked()
  })

  it('platform and test type filters list only distinct values present in the cases prop', () => {
    renderPicker()
    const platformSelect = screen.getByRole('combobox', { name: /platform/i })
    const platformOptions = Array.from(platformSelect.querySelectorAll('option')).map((o) => o.textContent)
    expect(platformOptions).toEqual(['All platforms', 'Mobile', 'Web'])

    const typeSelect = screen.getByRole('combobox', { name: /test type/i })
    const typeOptions = Array.from(typeSelect.querySelectorAll('option')).map((o) => o.textContent)
    expect(typeOptions).toEqual(['All test types', 'E2e', 'Functional'])
  })

  it('shows an explicit empty state when no case matches the filters', async () => {
    renderPicker()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /platform/i }), 'web')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /test type/i }), 'e2e')
    expect(screen.getByText(/no cases match/i)).toBeInTheDocument()
  })

  it('the "Selected only" toggle label reflects the selection count independent of the filtered row count', async () => {
    renderPicker({ selected: new Set(['c1', 'c3']) })
    expect(screen.getByRole('button', { name: /selected only \(2\)/i })).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /platform/i }), 'web')
    expect(screen.getByRole('button', { name: /selected only \(2\)/i })).toBeInTheDocument()
  })

  // --- section-tree scoping ---

  it('shows a section tree with an "All sections" entry selected by default', () => {
    renderPicker()
    const tree = screen.getByRole('tree', { name: /sections/i })
    expect(within(tree).getByText(/all sections/i)).toBeInTheDocument()
    expect(within(tree).getByText('Auth')).toBeInTheDocument()
    expect(within(tree).getByText('Checkout')).toBeInTheDocument()
  })

  it('scoping to a section narrows the list to that section and its descendants', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('treeitem', { name: /checkout/i }))
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
    // c3 lives in "Payments", a descendant of "Checkout" — must still show.
    expect(screen.getByText('Checkout completes with a valid card')).toBeInTheDocument()
  })

  it('"All sections" clears the scope back to everything', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('treeitem', { name: /checkout/i }))
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('treeitem', { name: /all sections/i }))
    expect(screen.getByText('Login succeeds')).toBeInTheDocument()
  })

  it('selection survives a scope change', async () => {
    renderPicker({ selected: new Set(['c1']) })
    await userEvent.click(screen.getByRole('treeitem', { name: /checkout/i }))
    expect(screen.queryByRole('checkbox', { name: /login succeeds/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('treeitem', { name: /all sections/i }))
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeChecked()
  })

  // --- search ---

  it('search narrows the list by title substring', async () => {
    renderPicker()
    await userEvent.type(screen.getByRole('textbox', { name: /search case titles/i }), 'checkout')
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
    expect(screen.getByText('Checkout completes with a valid card')).toBeInTheDocument()
  })

  it('search composes with an active section scope', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('treeitem', { name: /^auth/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /search case titles/i }), 'wrong password')
    expect(screen.getByText('Login fails for wrong password')).toBeInTheDocument()
    expect(screen.queryByText('Login succeeds')).not.toBeInTheDocument()
  })

  it('selection survives a search change', async () => {
    renderPicker({ selected: new Set(['c1']) })
    await userEvent.type(screen.getByRole('textbox', { name: /search case titles/i }), 'checkout')
    expect(screen.queryByRole('checkbox', { name: /login succeeds/i })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByRole('textbox', { name: /search case titles/i }))
    expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeChecked()
  })

  // --- "Selected only" toggle ---

  it('"Selected only" shows just the checked cases, across sections', async () => {
    renderPicker({ selected: new Set(['c1', 'c3']) })
    await userEvent.click(screen.getByRole('button', { name: /selected only/i }))
    expect(screen.getByText('Login succeeds')).toBeInTheDocument()
    expect(screen.getByText('Checkout completes with a valid card')).toBeInTheDocument()
    expect(screen.queryByText('Login fails for wrong password')).not.toBeInTheDocument()
  })

  it('section tree items are keyboard-activatable with Enter and Space', async () => {
    renderPicker()
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
    renderPicker()
    expect(screen.getByRole('tree', { name: /sections/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^hide$/i }))
    expect(screen.queryByRole('tree', { name: /sections/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /show sections/i }))
    expect(screen.getByRole('tree', { name: /sections/i })).toBeInTheDocument()
  })

  // --- bounded rendering at scale ---

  it('renders a bounded number of DOM rows regardless of how many cases match', () => {
    const many: CasePickerCase[] = Array.from({ length: 200 }, (_, i) => ({
      id: `bulk-${i}`,
      title: `Bulk case ${i}`,
      tags: [],
      priority: '',
      platform: '',
      testType: '',
      folderId: 'auth',
    }))
    renderPicker({ cases: many, selected: new Set() })
    const rendered = screen.getAllByRole('checkbox')
    expect(rendered.length).toBeLessThan(40)
    expect(rendered.length).toBeGreaterThan(0)
  })

  it('renders the correct rows after scrolling, not blank recycled rows', () => {
    const many: CasePickerCase[] = Array.from({ length: 200 }, (_, i) => ({
      id: `bulk-${i}`,
      title: `Bulk case ${i}`,
      tags: [],
      priority: '',
      platform: '',
      testType: '',
      folderId: 'auth',
    }))
    renderPicker({ cases: many, selected: new Set() })
    const viewport = screen.getByTestId('case-picker-viewport')
    // 11560px = (200 rows × 60px) - 440px viewport — the real max scrollTop a
    // browser would ever deliver for this content; jsdom doesn't clamp on its
    // own, so the test supplies a realistic value rather than an impossible one.
    fireEvent.scroll(viewport, { target: { scrollTop: 11560 } })
    expect(screen.getByText('Bulk case 199')).toBeInTheDocument()
  })

  describe('circular checkmark indicator (redesign-case-picker-membership)', () => {
    it('shows no native checkbox input — the row itself carries the checkbox role', () => {
      renderPicker()
      expect(document.querySelector('input[type="checkbox"]')).not.toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: /login succeeds/i })).toBeInTheDocument()
    })

    it('shows a checkmark icon only when the row is checked', () => {
      renderPicker({ selected: new Set(['c2']) })
      const checkedRow = screen.getByRole('checkbox', { name: /login fails/i })
      const uncheckedRow = screen.getByRole('checkbox', { name: /login succeeds/i })
      expect(checkedRow.querySelector('.lucide-check')).toBeInTheDocument()
      expect(uncheckedRow.querySelector('.lucide-check')).not.toBeInTheDocument()
    })

    it('tints the row background when checked, distinct from the unchecked state', () => {
      renderPicker({ selected: new Set(['c2']) })
      expect(screen.getByRole('checkbox', { name: /login fails/i })).toHaveClass('bg-primary/10')
      expect(screen.getByRole('checkbox', { name: /login succeeds/i })).not.toHaveClass('bg-primary/10')
    })

    it('marks a disabled row via aria-disabled, so toBeDisabled() still passes without a native input', async () => {
      const { onToggle } = renderPicker({ readOnly: true })
      const row = screen.getByRole('checkbox', { name: /checkout completes/i })
      expect(row).toBeDisabled()
      await userEvent.click(row)
      expect(onToggle).not.toHaveBeenCalled()
    })
  })

  describe('bidirectional Shift+Click range-toggle (redesign-case-picker-membership)', () => {
    function shiftClick(el: HTMLElement) {
      fireEvent.click(el, { shiftKey: true })
    }

    it('a first Shift+Click (no prior anchor) toggles just that row via onToggle, not onToggleRange', () => {
      const { onToggle, onToggleRange } = renderPicker()
      shiftClick(screen.getByRole('checkbox', { name: /login succeeds/i }))
      expect(onToggle).toHaveBeenCalledWith('c1')
      expect(onToggleRange).not.toHaveBeenCalled()
    })

    it('a later Shift+Click applies the clicked row\'s resulting (checked) state to the whole range', () => {
      const { onToggleRange } = renderPicker({ selected: new Set() })
      shiftClick(screen.getByRole('checkbox', { name: /login succeeds/i }))
      shiftClick(screen.getByRole('checkbox', { name: /checkout completes/i }))
      expect(onToggleRange).toHaveBeenCalledWith(['c1', 'c2', 'c3'], true)
    })

    it('a bidirectional range-toggle can also uncheck an already-checked range', () => {
      const { onToggleRange } = renderPicker({ selected: new Set(['c1', 'c2', 'c3']) })
      shiftClick(screen.getByRole('checkbox', { name: /login succeeds/i }))
      shiftClick(screen.getByRole('checkbox', { name: /checkout completes/i }))
      expect(onToggleRange).toHaveBeenCalledWith(['c1', 'c2', 'c3'], false)
    })

    it('a plain click (no shift) still calls only onToggle, even after an anchor exists', () => {
      const { onToggle, onToggleRange } = renderPicker()
      shiftClick(screen.getByRole('checkbox', { name: /login succeeds/i }))
      onToggleRange.mockClear()
      onToggle.mockClear()
      fireEvent.click(screen.getByRole('checkbox', { name: /checkout completes/i }))
      expect(onToggle).toHaveBeenCalledWith('c3')
      expect(onToggleRange).not.toHaveBeenCalled()
    })
  })

  describe('keyboard navigation (redesign-case-picker-membership)', () => {
    it('arrow keys move real keyboard focus through the rows', async () => {
      renderPicker()
      await userEvent.keyboard('{ArrowDown}')
      expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /login fails/i }))
    })

    it('j/k move focus the same as arrow keys', async () => {
      renderPicker()
      await userEvent.keyboard('jj')
      await userEvent.keyboard('k')
      expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /login fails/i }))
    })

    it('clamps focus at the last row', async () => {
      renderPicker()
      await userEvent.keyboard('jjjj')
      expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /checkout completes/i }))
    })

    it('clamps focus at the first row', async () => {
      renderPicker()
      await userEvent.keyboard('kkkk')
      expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /login succeeds/i }))
    })

    it('Space toggles the arrow-focused row', async () => {
      const { onToggle } = renderPicker()
      await userEvent.keyboard('j')
      await userEvent.keyboard(' ')
      expect(onToggle).toHaveBeenCalledWith('c2')
    })

    it('Shift+Space extends the bidirectional range from the anchor to the focused row', async () => {
      const { onToggleRange } = renderPicker({ selected: new Set() })
      // Establishes real focus on the first row, matching a realistic entry
      // path (e.g. Tab into the picker) — Space alone with nothing focused
      // anywhere on the page has no target, by design.
      screen.getByRole('checkbox', { name: /login succeeds/i }).focus()
      await userEvent.keyboard(' ')
      await userEvent.keyboard('jj')
      await userEvent.keyboard('{Shift>} {/Shift}')
      expect(onToggleRange).toHaveBeenCalledWith(['c1', 'c2', 'c3'], true)
    })

    it('Enter does nothing — a picker row has no "open" destination', async () => {
      const { onToggle, onToggleRange } = renderPicker()
      await userEvent.keyboard('{Enter}')
      expect(onToggle).not.toHaveBeenCalled()
      expect(onToggleRange).not.toHaveBeenCalled()
    })

    it('arrow keys do nothing while the search box has focus', async () => {
      renderPicker()
      const search = screen.getByRole('textbox', { name: /search case titles/i })
      search.focus()
      await userEvent.keyboard('{ArrowDown}')
      expect(document.activeElement).toBe(search)
    })

    it('scrolls the virtualized viewport directly (not scrollIntoView) to keep the focused row in the rendered window', async () => {
      const many: CasePickerCase[] = Array.from({ length: 200 }, (_, i) => ({
        id: `bulk-${i}`,
        title: `Bulk case ${i}`,
        tags: [],
        priority: '',
        platform: '',
        testType: '',
        folderId: 'auth',
      }))
      renderPicker({ cases: many, selected: new Set() })
      const viewport = screen.getByTestId('case-picker-viewport')
      for (let i = 0; i < 30; i++) {
        // eslint-disable-next-line no-await-in-loop
        await userEvent.keyboard('j')
      }
      expect(viewport.scrollTop).toBeGreaterThan(0)
      expect(screen.getByRole('checkbox', { name: /bulk case 30/i })).toBeInTheDocument()
    })
  })

  it('shows a persistent shortcuts hint and opens an overlay with ? (redesign-case-picker-membership)', async () => {
    renderPicker()
    expect(screen.getByLabelText('Keyboard shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Move focus')).toBeInTheDocument()

    await userEvent.keyboard('?')
    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument()
  })

  it('caps tags at 2 with an overflow badge', () => {
    const withManyTags: CasePickerCase[] = [
      { id: 'c1', title: 'Many tags case', tags: ['a', 'b', 'c', 'd'], priority: '', platform: '', testType: '', folderId: 'auth' },
    ]
    renderPicker({ cases: withManyTags })
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
