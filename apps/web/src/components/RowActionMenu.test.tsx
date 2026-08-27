import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RowActionMenu, type RowActionMenuHandle } from './RowActionMenu'

function OpenAtHarness({ x, y }: { x: number; y: number }) {
  const ref = useRef<RowActionMenuHandle>(null)
  return (
    <>
      <button type="button" onClick={() => ref.current?.openAt(x, y)}>
        Right-click stand-in
      </button>
      <RowActionMenu
        ref={ref}
        label="Actions for Two-Factor"
        items={[{ label: 'Delete', onSelect: vi.fn(), danger: true }]}
      />
    </>
  )
}

describe('RowActionMenu', () => {
  it('shows a trigger and no menu until opened', () => {
    render(<RowActionMenu label="Actions for Two-Factor" items={[{ label: 'Move to…', onSelect: vi.fn() }]} />)
    expect(screen.getByRole('button', { name: 'Actions for Two-Factor' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the menu and lists every item', async () => {
    render(
      <RowActionMenu
        label="Actions for Two-Factor"
        items={[
          { label: 'Move to…', onSelect: vi.fn() },
          { label: 'Delete', onSelect: vi.fn(), danger: true, dividerBefore: true },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Two-Factor' }))
    expect(screen.getByRole('menuitem', { name: 'Move to…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('calls onSelect and closes the menu when an item is clicked', async () => {
    const onSelect = vi.fn()
    render(<RowActionMenu label="Actions for Two-Factor" items={[{ label: 'Delete', onSelect, danger: true }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Two-Factor' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu when clicking outside', async () => {
    render(
      <div>
        <RowActionMenu label="Actions for Two-Factor" items={[{ label: 'Move to…', onSelect: vi.fn() }]} />
        <button type="button">Elsewhere</button>
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Two-Factor' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu on Escape', async () => {
    render(<RowActionMenu label="Actions for Two-Factor" items={[{ label: 'Move to…', onSelect: vi.fn() }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Two-Factor' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders a danger item with destructive styling and a divider above it', async () => {
    render(
      <RowActionMenu
        label="Actions for Two-Factor"
        items={[
          { label: 'Move to…', onSelect: vi.fn() },
          { label: 'Delete', onSelect: vi.fn(), danger: true, dividerBefore: true },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Two-Factor' }))
    const deleteItem = screen.getByRole('menuitem', { name: 'Delete' })
    expect(deleteItem.className).toContain('text-destructive')
    expect(deleteItem.previousElementSibling).toHaveAttribute('role', 'separator')
  })

  it('opens at an explicit position via the imperative openAt handle', async () => {
    render(<OpenAtHarness x={120} y={80} />)
    await userEvent.click(screen.getByRole('button', { name: 'Right-click stand-in' }))
    expect(screen.getByRole('menu')).toHaveStyle({ left: '120px', top: '80px' })
  })

  it('closes a ref-opened (cursor-positioned) menu on Escape, same as the button-opened one', async () => {
    render(<OpenAtHarness x={10} y={10} />)
    await userEvent.click(screen.getByRole('button', { name: 'Right-click stand-in' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('portals the button-opened menu to <body>, positioned fixed under the trigger, so an overflow-hidden ancestor (e.g. Card) can never clip it', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 120,
      left: 200,
      right: 240,
      width: 40,
      height: 20,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000)

    const { container } = render(
      <div style={{ overflow: 'hidden' }} data-testid="clipping-ancestor">
        <RowActionMenu label="Actions for Two-Factor" items={[{ label: 'Move to…', onSelect: vi.fn() }]} />
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Two-Factor' }))

    const menu = screen.getByRole('menu')
    expect(container.contains(menu)).toBe(false)
    expect(document.body.contains(menu)).toBe(true)
    expect(menu.className).toContain('fixed')
    expect(menu).toHaveStyle({ top: '124px' })
    expect(menu).toHaveStyle({ right: '760px' })
  })

  it('flips the button-opened menu upward when there is not enough room below the trigger, so it never renders past the viewport bottom', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 680,
      bottom: 700,
      left: 200,
      right: 240,
      width: 40,
      height: 20,
      x: 200,
      y: 680,
      toJSON: () => ({}),
    })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(720)

    render(
      <RowActionMenu
        label="Actions for Regression run"
        items={[
          { label: 'Compare…', onSelect: vi.fn() },
          { label: 'Delete', onSelect: vi.fn(), danger: true, dividerBefore: true },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Regression run' }))

    const menu = screen.getByRole('menu')
    expect(menu).toHaveStyle({ bottom: '44px' })
    expect(menu.style.top).toBe('')
  })

  it('renders a disabled item that does not fire onSelect when clicked', async () => {
    const onSelect = vi.fn()
    render(
      <RowActionMenu
        label="Actions for Two-Factor"
        items={[{ label: 'Move up', onSelect, disabled: true }]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Two-Factor' }))
    const item = screen.getByRole('menuitem', { name: 'Move up' })
    expect(item).toBeDisabled()
    await userEvent.click(item)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('is fully visible by default, with no hover/focus-reveal opacity classes (polish-library-and-suites-pages)', () => {
    render(<RowActionMenu label="Actions for Two-Factor" items={[{ label: 'Move to…', onSelect: vi.fn() }]} />)
    expect(screen.getByRole('button', { name: 'Actions for Two-Factor' })).not.toHaveClass('opacity-0')
  })

  it('is hidden until hover/focus when hoverReveal is set (polish-library-and-suites-pages)', () => {
    render(
      <RowActionMenu
        label="Actions for Two-Factor"
        items={[{ label: 'Move to…', onSelect: vi.fn() }]}
        hoverReveal
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Actions for Two-Factor' })
    expect(trigger).toHaveClass('opacity-0', 'group-hover:opacity-100', 'group-focus-within:opacity-100')
  })

  it('stays visible while open even with hoverReveal set, so the trigger does not vanish under an open menu (polish-library-and-suites-pages)', async () => {
    render(
      <RowActionMenu
        label="Actions for Two-Factor"
        items={[{ label: 'Move to…', onSelect: vi.fn() }]}
        hoverReveal
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Actions for Two-Factor' })
    await userEvent.click(trigger)
    expect(trigger).toHaveClass('opacity-100')
  })

  it('renders a custom trigger instead of the default overflow icon when one is given', async () => {
    render(
      <RowActionMenu
        label="Mark as"
        trigger={<span data-testid="custom-trigger-content">Mark as</span>}
        items={[{ label: 'Pass', onSelect: vi.fn() }]}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Mark as' })
    expect(trigger.querySelector('[data-testid="custom-trigger-content"]')).toBeInTheDocument()
    expect(trigger.querySelector('svg')).not.toBeInTheDocument()
    await userEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Pass' })).toBeInTheDocument()
  })
})
