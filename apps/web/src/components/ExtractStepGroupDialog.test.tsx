import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExtractStepGroupDialog } from './ExtractStepGroupDialog'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { POST: vi.fn() } }))
const mockPOST = vi.mocked(api.POST)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ExtractStepGroupDialog', () => {
  it('creates a group from the selected steps and hands it back via onExtracted', async () => {
    const onExtracted = vi.fn()
    mockPOST.mockResolvedValue({
      data: { id: 'sg2', key: 'SP-SG2', name: 'New shared bit', steps: [{ action: 'a' }], createdAt: '', updatedAt: '' },
      response: { ok: true },
    })
    render(
      <ExtractStepGroupDialog
        open
        onOpenChange={vi.fn()}
        projectKey="SP"
        selectedSteps={[{ action: 'a' }]}
        onExtracted={onExtracted}
      />,
    )
    await userEvent.type(screen.getByLabelText(/group name/i), 'New shared bit')
    await userEvent.click(screen.getByRole('button', { name: /create group/i }))
    await waitFor(() => expect(onExtracted).toHaveBeenCalledWith(expect.objectContaining({ id: 'sg2' })))
  })

  it('shows an error message and does not call onExtracted when the create request fails', async () => {
    const onExtracted = vi.fn()
    mockPOST.mockResolvedValue({ error: { error: 'you do not have permission to manage this project' }, response: { ok: false } })
    render(
      <ExtractStepGroupDialog
        open
        onOpenChange={vi.fn()}
        projectKey="SP"
        selectedSteps={[{ action: 'a' }]}
        onExtracted={onExtracted}
      />,
    )
    await userEvent.type(screen.getByLabelText(/group name/i), 'New shared bit')
    await userEvent.click(screen.getByRole('button', { name: /create group/i }))
    expect(await screen.findByText(/you do not have permission to manage this project/i)).toBeInTheDocument()
    expect(onExtracted).not.toHaveBeenCalled()
  })
})
