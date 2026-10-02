import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaseAttachmentField } from './CaseAttachmentField'
import type { components } from '@testpulse/shared/api'

type CaseAttachment = components['schemas']['CaseAttachment']

function attachment(id: string, filename: string, contentType: string): CaseAttachment {
  return { id, caseId: 'case-1', filename, contentType, createdAt: '2026-08-05T00:00:00Z' }
}

function baseProps() {
  return {
    attachments: [] as CaseAttachment[],
    failed: [] as { id: string; filename: string }[],
    lastError: null as { filename: string; reason: string } | null,
    canEdit: true,
    onSelectFile: vi.fn(),
    onRemove: vi.fn(),
    onOpenLightbox: vi.fn(),
  }
}

describe('CaseAttachmentField', () => {
  it('renders nothing for a read-only viewer when there are no attachments', () => {
    const props = { ...baseProps(), canEdit: false }
    const { container } = render(<CaseAttachmentField {...props} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an "Attach reference file" ghost link for an editor with no attachments', () => {
    render(<CaseAttachmentField {...baseProps()} />)
    expect(screen.getByRole('button', { name: /attach reference file/i })).toBeInTheDocument()
  })

  it('selecting a file via the hidden input calls onSelectFile', async () => {
    const props = baseProps()
    render(<CaseAttachmentField {...props} />)
    const file = new File(['x'], 'mock.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    expect(props.onSelectFile).toHaveBeenCalledWith(file)
  })

  it('renders an image attachment as a clickable thumbnail that opens the lightbox', async () => {
    const user = userEvent.setup()
    const props = { ...baseProps(), attachments: [attachment('a1', 'mock.png', 'image/png')] }
    render(<CaseAttachmentField {...props} />)
    await user.click(screen.getByRole('button', { name: /open attachment mock\.png/i }))
    expect(props.onOpenLightbox).toHaveBeenCalledWith(0)
  })

  it('renders a PDF attachment as a filename+icon chip linking to the file, not a thumbnail', () => {
    const props = { ...baseProps(), attachments: [attachment('a1', 'spec.pdf', 'application/pdf')] }
    render(<CaseAttachmentField {...props} />)
    const link = screen.getByRole('link', { name: /open spec\.pdf/i })
    expect(link).toHaveAttribute('href', '/api/v1/case-attachments/a1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('spec.pdf')).toBeInTheDocument()
  })

  it('renders a text/log attachment as the same filename+icon chip as a PDF', () => {
    const props = { ...baseProps(), attachments: [attachment('a1', 'run.log', 'text/plain')] }
    render(<CaseAttachmentField {...props} />)
    const link = screen.getByRole('link', { name: /open run\.log/i })
    expect(link).toHaveAttribute('href', '/api/v1/case-attachments/a1')
  })

  it('clicking remove on a chip calls onRemove without navigating', async () => {
    const user = userEvent.setup()
    const props = { ...baseProps(), attachments: [attachment('a1', 'spec.pdf', 'application/pdf')] }
    render(<CaseAttachmentField {...props} />)
    await user.click(screen.getByRole('button', { name: /remove spec\.pdf/i }))
    expect(props.onRemove).toHaveBeenCalledWith('a1')
  })

  it('clicking remove on a thumbnail calls onRemove without opening the lightbox', async () => {
    const user = userEvent.setup()
    const props = { ...baseProps(), attachments: [attachment('a1', 'mock.png', 'image/png')] }
    render(<CaseAttachmentField {...props} />)
    await user.click(screen.getByRole('button', { name: /remove mock\.png/i }))
    expect(props.onRemove).toHaveBeenCalledWith('a1')
    expect(props.onOpenLightbox).not.toHaveBeenCalled()
  })

  it('hides upload and remove controls for a read-only viewer with existing attachments', () => {
    const props = { ...baseProps(), canEdit: false, attachments: [attachment('a1', 'mock.png', 'image/png')] }
    render(<CaseAttachmentField {...props} />)
    expect(screen.queryByRole('button', { name: /remove mock\.png/i })).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument()
  })

  it('renders a failed tile for each failed upload', () => {
    const props = { ...baseProps(), failed: [{ id: 'f1', filename: 'bad.exe' }] }
    render(<CaseAttachmentField {...props} />)
    expect(screen.getByLabelText(/bad\.exe failed to attach/i)).toBeInTheDocument()
  })

  it('shows the last error reason when present', () => {
    const props = { ...baseProps(), lastError: { filename: 'bad.exe', reason: "isn't a supported file type" } }
    render(<CaseAttachmentField {...props} />)
    expect(screen.getByText(/bad\.exe/)).toBeInTheDocument()
    expect(screen.getByText(/isn't a supported file type/)).toBeInTheDocument()
  })
})
