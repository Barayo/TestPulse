import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LibraryBulkActionBar } from './LibraryBulkActionBar'

describe('LibraryBulkActionBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(
      <LibraryBulkActionBar count={0} total={5} onSelectAll={vi.fn()} actions={[]} onClear={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the selected count', () => {
    render(<LibraryBulkActionBar count={2} total={5} onSelectAll={vi.fn()} actions={[]} onClear={vi.fn()} />)
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('shows a "Select all" link when fewer than every visible case is selected', async () => {
    const onSelectAll = vi.fn()
    render(<LibraryBulkActionBar count={2} total={5} onSelectAll={onSelectAll} actions={[]} onClear={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /select all 5/i }))
    expect(onSelectAll).toHaveBeenCalledOnce()
  })

  it('hides "Select all" once every visible case is already selected', () => {
    render(<LibraryBulkActionBar count={5} total={5} onSelectAll={vi.fn()} actions={[]} onClear={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument()
  })

  it('renders a plain button for a "button" action', async () => {
    const onSelect = vi.fn()
    render(
      <LibraryBulkActionBar
        count={2}
        total={5}
        onSelectAll={vi.fn()}
        actions={[{ kind: 'button', label: 'Move to…', onSelect }]}
        onClear={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Move to…' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('calls onClear when Clear is clicked', async () => {
    const onClear = vi.fn()
    render(<LibraryBulkActionBar count={1} total={5} onSelectAll={vi.fn()} actions={[]} onClear={onClear} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('is fixed to the bottom of the viewport, matching ConfirmBanner\'s elevated-toast idiom', () => {
    const { container } = render(
      <LibraryBulkActionBar count={1} total={5} onSelectAll={vi.fn()} actions={[]} onClear={vi.fn()} />,
    )
    expect(container.firstChild).toHaveClass('fixed', 'inset-x-4', 'bottom-4', 'shadow-lg')
  })
})
