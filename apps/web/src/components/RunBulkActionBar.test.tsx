import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RunBulkActionBar } from './RunBulkActionBar'

describe('RunBulkActionBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<RunBulkActionBar count={0} actions={[]} onClear={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a plain button for a "button" action', async () => {
    const onSelect = vi.fn()
    render(
      <RunBulkActionBar
        count={2}
        actions={[{ kind: 'button', label: 'Assign selected…', onSelect }]}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Assign selected…' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('renders a dropdown trigger for a "menu" action, listing its items on click', async () => {
    const onSelectPass = vi.fn()
    render(
      <RunBulkActionBar
        count={3}
        actions={[{ kind: 'menu', label: 'Mark as', items: [{ label: 'Pass', onSelect: onSelectPass }] }]}
        onClear={vi.fn()}
      />,
    )
    expect(screen.queryByRole('menuitem', { name: 'Pass' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mark as' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pass' }))
    expect(onSelectPass).toHaveBeenCalledOnce()
  })

  it('calls onClear when Clear is clicked', async () => {
    const onClear = vi.fn()
    render(<RunBulkActionBar count={1} actions={[]} onClear={onClear} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})
