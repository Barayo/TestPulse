import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AttachmentField } from './AttachmentField'
import type { components } from '@testpulse/shared/api'

type Attachment = components['schemas']['Attachment']

function attachment(id: string, filename = `${id}.png`): Attachment {
  return { id, runItemId: 'item-1', filename, contentType: 'image/png', createdAt: '2026-08-05T00:00:00Z' }
}

function baseProps() {
  return {
    attachments: [] as Attachment[],
    failed: [] as { id: string; filename: string }[],
    highlightId: null as string | null,
    lastError: null as { filename: string; reason: string } | null,
    onSelectFile: vi.fn(),
    onRemove: vi.fn(),
    onOpenLightbox: vi.fn(),
  }
}

describe('AttachmentField', () => {
  it('shows the Attachments label and an empty-state invitation', () => {
    render(<AttachmentField {...baseProps()} />)
    expect(screen.getByText('Attachments')).toBeInTheDocument()
    expect(screen.getByText(/click, drag a screenshot in, or paste it here/i)).toBeInTheDocument()
  })

  it('selecting a file via the hidden input calls onSelectFile', async () => {
    const props = baseProps()
    render(<AttachmentField {...props} />)
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    expect(props.onSelectFile).toHaveBeenCalledWith(file)
  })

  it('pasting an image onto the drop zone calls onSelectFile', () => {
    const props = baseProps()
    render(<AttachmentField {...props} />)
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    const zone = screen.getByRole('group', { name: /attachments/i })
    // fireEvent isn't imported at top-level in other tests in this repo via RTL directly; use dispatchEvent-free helper via fireEvent import
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as unknown as ClipboardEvent
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
    })
    zone.dispatchEvent(pasteEvent)
    expect(props.onSelectFile).toHaveBeenCalledWith(file)
  })

  it('dropping an image onto the drop zone calls onSelectFile', () => {
    const props = baseProps()
    render(<AttachmentField {...props} />)
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    const zone = screen.getByRole('group', { name: /attachments/i })
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as unknown as DragEvent
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } })
    zone.dispatchEvent(dropEvent)
    expect(props.onSelectFile).toHaveBeenCalledWith(file)
  })

  it('shows "N attached" once there are staged attachments', () => {
    const props = { ...baseProps(), attachments: [attachment('a1'), attachment('a2')] }
    render(<AttachmentField {...props} />)
    expect(screen.getByText(/2 attached/i)).toBeInTheDocument()
    expect(screen.queryByText(/click, drag a screenshot in/i)).not.toBeInTheDocument()
  })

  it('shows the failed count alongside the attached count', () => {
    const props = {
      ...baseProps(),
      attachments: [attachment('a1')],
      failed: [{ id: 'f1', filename: 'diagram.gif' }],
    }
    render(<AttachmentField {...props} />)
    expect(screen.getByText(/1 attached, 1 failed/i)).toBeInTheDocument()
  })

  it('clicking a thumbnail opens the lightbox at that index, not the remove button', async () => {
    const user = userEvent.setup()
    const props = { ...baseProps(), attachments: [attachment('a1'), attachment('a2')] }
    render(<AttachmentField {...props} />)
    await user.click(screen.getByRole('button', { name: /open attachment a2\.png/i }))
    expect(props.onOpenLightbox).toHaveBeenCalledWith(1)
    expect(props.onRemove).not.toHaveBeenCalled()
  })

  it('clicking the remove control removes without opening the lightbox', async () => {
    const user = userEvent.setup()
    const props = { ...baseProps(), attachments: [attachment('a1')] }
    render(<AttachmentField {...props} />)
    await user.click(screen.getByRole('button', { name: /remove a1\.png/i }))
    expect(props.onRemove).toHaveBeenCalledWith('a1')
    expect(props.onOpenLightbox).not.toHaveBeenCalled()
  })

  it('renders a failed tile for each failed upload', () => {
    const props = { ...baseProps(), failed: [{ id: 'f1', filename: 'diagram.gif' }] }
    render(<AttachmentField {...props} />)
    expect(screen.getByLabelText(/diagram\.gif failed to attach/i)).toBeInTheDocument()
  })

  it('shows a two-line error callout with a bold title and the specific reason', () => {
    const props = { ...baseProps(), lastError: { filename: 'diagram.gif', reason: "isn't a PNG, JPEG, or WebP image" } }
    render(<AttachmentField {...props} />)
    expect(screen.getByText(/couldn't attach that file/i)).toBeInTheDocument()
    expect(screen.getByText(/isn't a png, jpeg, or webp image/i)).toBeInTheDocument()
  })

  it('marks the highlighted attachment for the just-added pulse treatment', () => {
    const props = { ...baseProps(), attachments: [attachment('a1'), attachment('a2')], highlightId: 'a2' }
    render(<AttachmentField {...props} />)
    expect(screen.getByRole('button', { name: /open attachment a2\.png/i })).toHaveAttribute('data-highlighted', 'true')
    expect(screen.getByRole('button', { name: /open attachment a1\.png/i })).not.toHaveAttribute('data-highlighted')
  })
})
