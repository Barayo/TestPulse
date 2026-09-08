import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadMoreButton } from './LoadMoreButton'

describe('LoadMoreButton', () => {
  it('renders nothing when hasMore is false', () => {
    const { container } = render(<LoadMoreButton hasMore={false} loading={false} onClick={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a "Load more" button by default when hasMore is true', () => {
    render(<LoadMoreButton hasMore loading={false} onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<LoadMoreButton hasMore loading={false} onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows a disabled "Loading…" state while loading', () => {
    render(<LoadMoreButton hasMore loading onClick={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Loading…' })
    expect(button).toBeDisabled()
  })

  it('supports a custom label', () => {
    render(<LoadMoreButton hasMore loading={false} onClick={vi.fn()} label="Load more runs" />)
    expect(screen.getByRole('button', { name: 'Load more runs' })).toBeInTheDocument()
  })
})
