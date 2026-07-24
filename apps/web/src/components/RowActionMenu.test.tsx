import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RowActionMenu } from './RowActionMenu'

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
})
