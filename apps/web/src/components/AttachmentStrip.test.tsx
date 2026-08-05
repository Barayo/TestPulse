import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AttachmentStrip } from './AttachmentStrip'
import type { components } from '@testpulse/shared/api'

type Attachment = components['schemas']['Attachment']

function attachment(id: string, filename = `${id}.png`): Attachment {
  return { id, runItemId: 'item-1', filename, contentType: 'image/png', createdAt: '2026-08-05T00:00:00Z' }
}

describe('AttachmentStrip', () => {
  it('renders one thumbnail per attachment, up to 3, with no overflow tile', () => {
    const atts = [attachment('a1'), attachment('a2')]
    render(<AttachmentStrip attachments={atts} onSelect={vi.fn()} />)

    expect(screen.getAllByRole('button', { name: /open attachment/i })).toHaveLength(2)
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('shows at most 3 thumbnails plus a "+N" overflow tile for more', () => {
    const atts = [attachment('a1'), attachment('a2'), attachment('a3'), attachment('a4'), attachment('a5'), attachment('a6')]
    render(<AttachmentStrip attachments={atts} onSelect={vi.fn()} />)

    expect(screen.getAllByRole('button', { name: /open attachment/i })).toHaveLength(3)
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('calls onSelect with the attachment index when a thumbnail is activated', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const atts = [attachment('a1'), attachment('a2')]
    render(<AttachmentStrip attachments={atts} onSelect={onSelect} />)

    await user.click(screen.getAllByRole('button', { name: /open attachment/i })[1])
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('clicking the overflow tile opens the lightbox at the first hidden attachment', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const atts = [attachment('a1'), attachment('a2'), attachment('a3'), attachment('a4')]
    render(<AttachmentStrip attachments={atts} onSelect={onSelect} />)

    await user.click(screen.getByText('+1'))
    expect(onSelect).toHaveBeenCalledWith(3)
  })

  it('renders nothing when there are no attachments', () => {
    const { container } = render(<AttachmentStrip attachments={[]} onSelect={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
