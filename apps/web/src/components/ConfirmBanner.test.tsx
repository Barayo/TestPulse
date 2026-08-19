import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ConfirmBanner } from './ConfirmBanner'

describe('ConfirmBanner', () => {
  it('renders the message', () => {
    render(<ConfirmBanner message="Run created successfully" onDismiss={vi.fn()} />)
    expect(screen.getByText('Run created successfully')).toBeInTheDocument()
  })

  it('renders an optional link', () => {
    render(
      <MemoryRouter>
        <ConfirmBanner message="Run created" linkTo="/runs/r1" linkLabel="View run" onDismiss={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'View run' })).toHaveAttribute('href', '/runs/r1')
  })

  it('omits the link when none is given', () => {
    render(<ConfirmBanner message="Run created" onDismiss={vi.fn()} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const onDismiss = vi.fn()
    render(<ConfirmBanner message="Run created" onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('does not auto-dismiss', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<ConfirmBanner message="Run created" onDismiss={onDismiss} />)
    vi.advanceTimersByTime(60_000)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('is positioned as a fixed, viewport-anchored toast', () => {
    render(<ConfirmBanner message="Run created" onDismiss={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveClass('fixed')
  })

  it('renders an icon-based dismiss control, not a raw glyph', () => {
    render(<ConfirmBanner message="Run created" onDismiss={vi.fn()} />)
    const dismiss = screen.getByRole('button', { name: /dismiss/i })
    expect(dismiss.querySelector('svg')).toBeInTheDocument()
    expect(dismiss).not.toHaveTextContent('✕')
  })
})
