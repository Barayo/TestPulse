import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangePasswordForm } from './ChangePasswordForm'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { POST: vi.fn() } }))
const mockPOST = vi.mocked(api.POST)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ChangePasswordForm', () => {
  it('renders current and new password fields', () => {
    render(<ChangePasswordForm onSuccess={vi.fn()} />)
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
  })

  it('submits both fields and calls onSuccess on success', async () => {
    mockPOST.mockResolvedValue({ data: undefined, error: undefined, response: { ok: true, status: 204 } as Response })
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<ChangePasswordForm onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText(/current password/i), 'correcthorse-old')
    await user.type(screen.getByLabelText(/^new password$/i), 'correcthorse-new')
    await user.click(screen.getByRole('button', { name: /change password/i }))

    expect(mockPOST).toHaveBeenCalledWith(
      '/api/v1/users/me/password',
      expect.objectContaining({ body: { currentPassword: 'correcthorse-old', newPassword: 'correcthorse-new' } }),
    )
    expect(onSuccess).toHaveBeenCalled()
  })

  it('shows an inline error and does not call onSuccess on failure', async () => {
    mockPOST.mockResolvedValue({
      data: undefined,
      error: { error: 'incorrect current password' },
      response: { ok: false, status: 401 } as Response,
    })
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<ChangePasswordForm onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText(/current password/i), 'wrong')
    await user.type(screen.getByLabelText(/^new password$/i), 'correcthorse-new')
    await user.click(screen.getByRole('button', { name: /change password/i }))

    expect(await screen.findByText(/incorrect current password/i)).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('renders a Cancel button only when onCancel is provided', () => {
    const { rerender } = render(<ChangePasswordForm onSuccess={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()

    rerender(<ChangePasswordForm onSuccess={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<ChangePasswordForm onSuccess={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalled()
  })

  describe('Generate password', () => {
    it('fills the new-password field with a generated value and reveals the chip', async () => {
      const user = userEvent.setup()
      render(<ChangePasswordForm onSuccess={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /generate/i }))

      const newPasswordInput = screen.getByLabelText(/^new password$/i) as HTMLInputElement
      expect(newPasswordInput.value.length).toBeGreaterThanOrEqual(12)
      expect(screen.getByText(newPasswordInput.value)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument()
    })

    it('invalidates the chip when the new-password field is edited afterward', async () => {
      const user = userEvent.setup()
      render(<ChangePasswordForm onSuccess={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /generate/i }))
      const newPasswordInput = screen.getByLabelText(/^new password$/i) as HTMLInputElement
      const generated = newPasswordInput.value
      await user.type(newPasswordInput, 'x')

      expect(screen.queryByText(generated)).not.toBeInTheDocument()
    })

    it('submits successfully using the generated password', async () => {
      mockPOST.mockResolvedValue({ data: undefined, error: undefined, response: { ok: true, status: 204 } as Response })
      const onSuccess = vi.fn()
      const user = userEvent.setup()
      render(<ChangePasswordForm onSuccess={onSuccess} />)

      await user.type(screen.getByLabelText(/current password/i), 'correcthorse-old')
      await user.click(screen.getByRole('button', { name: /generate/i }))
      const newPasswordInput = screen.getByLabelText(/^new password$/i) as HTMLInputElement
      const generated = newPasswordInput.value
      await user.click(screen.getByRole('button', { name: /change password/i }))

      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/users/me/password',
        expect.objectContaining({ body: { currentPassword: 'correcthorse-old', newPassword: generated } }),
      )
      expect(onSuccess).toHaveBeenCalled()
    })
  })
})
