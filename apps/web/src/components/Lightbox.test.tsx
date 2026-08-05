import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Lightbox } from './Lightbox'
import type { components } from '@testpulse/shared/api'

type Attachment = components['schemas']['Attachment']

function attachment(id: string, filename = `${id}.png`): Attachment {
  return { id, runItemId: 'item-1', filename, contentType: 'image/png', createdAt: '2026-08-05T00:00:00Z' }
}

describe('Lightbox', () => {
  it('shows the current attachment with a 1-based position caption', () => {
    const atts = [attachment('a1'), attachment('a2'), attachment('a3')]
    render(<Lightbox attachments={atts} index={1} onClose={vi.fn()} onNavigate={vi.fn()} />)

    expect(screen.getByText(/2 of 3/)).toBeInTheDocument()
    expect(screen.getByText(/a2\.png/)).toBeInTheDocument()
  })

  it('calls onNavigate with the next/previous index', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const atts = [attachment('a1'), attachment('a2'), attachment('a3')]
    render(<Lightbox attachments={atts} index={1} onClose={vi.fn()} onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(onNavigate).toHaveBeenCalledWith(2)
    await user.click(screen.getByRole('button', { name: /previous/i }))
    expect(onNavigate).toHaveBeenCalledWith(0)
  })

  it('does not show a previous/next control at either end', () => {
    const atts = [attachment('a1'), attachment('a2')]
    const { rerender } = render(<Lightbox attachments={atts} index={0} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()

    rerender(<Lightbox attachments={atts} index={1} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
  })

  it('calls onClose when the close control is activated', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Lightbox attachments={[attachment('a1')]} index={0} onClose={onClose} onNavigate={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Lightbox attachments={[attachment('a1')]} index={0} onClose={onClose} onNavigate={vi.fn()} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders a filmstrip thumbnail per attachment, marking the active one', () => {
    const atts = [attachment('a1'), attachment('a2'), attachment('a3')]
    render(<Lightbox attachments={atts} index={1} onClose={vi.fn()} onNavigate={vi.fn()} />)

    const filmstripButtons = screen.getAllByRole('button', { name: /^show a[123]\.png$/i })
    expect(filmstripButtons).toHaveLength(3)
    expect(filmstripButtons[1]).toHaveAttribute('aria-current', 'true')
  })

  it('includes optional caption extra content (actor/verdict/time) when supplied', () => {
    render(
      <Lightbox
        attachments={[attachment('a1')]}
        index={0}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        captionExtra="Sam Okafor · Failed · 1 hour ago"
      />,
    )
    expect(screen.getByText(/Sam Okafor · Failed · 1 hour ago/)).toBeInTheDocument()
  })
})
