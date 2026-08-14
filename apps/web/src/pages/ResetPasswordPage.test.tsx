import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ResetPasswordPage from './ResetPasswordPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { POST: vi.fn() } }))
const mockPOST = vi.mocked(api.POST)

beforeEach(() => {
  vi.resetAllMocks()
})

function renderPage(search = '?token=reset-token-123') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>login stub</div>} />
        <Route path="/forgot-password" element={<div>forgot-password stub</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  it('renders new-password and confirm-password fields with a submit button, given a token', () => {
    renderPage()
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
  })

  it('shows the dead-link state immediately when the URL has no token, without calling the API', () => {
    renderPage('')
    expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/request a new link/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('rejects empty fields client-side', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByText(/enter a new password and confirm it/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('rejects a password under 12 characters client-side, with the server error text verbatim', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/^new password$/i), 'short')
    await user.type(screen.getByLabelText(/confirm new password/i), 'short')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByText(/password must be at least 12 characters/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords client-side', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/^new password$/i), 'correcthorse-one')
    await user.type(screen.getByLabelText(/confirm new password/i), 'correcthorse-two')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('submits the token and new password, then navigates to login with a success signal', async () => {
    mockPOST.mockResolvedValue({ data: undefined, error: undefined, response: { ok: true, status: 204 } as Response })
    const user = userEvent.setup()
    renderPage('?token=reset-token-123')

    await user.type(screen.getByLabelText(/^new password$/i), 'correcthorse-new')
    await user.type(screen.getByLabelText(/confirm new password/i), 'correcthorse-new')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByText('login stub')).toBeInTheDocument()
    expect(mockPOST).toHaveBeenCalledWith(
      '/api/v1/auth/reset-password',
      expect.objectContaining({ body: { token: 'reset-token-123', newPassword: 'correcthorse-new' } }),
    )
  })

  it('shows the dead-link state on a 400 (invalid or expired token)', async () => {
    mockPOST.mockResolvedValue({
      data: undefined,
      error: { error: 'invalid or expired reset link' },
      response: { ok: false, status: 400 } as Response,
    })
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/^new password$/i), 'correcthorse-new')
    await user.type(screen.getByLabelText(/confirm new password/i), 'correcthorse-new')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByText(/request a new link/i)).toBeInTheDocument()
  })

  it('shows a network-failure message when the request throws', async () => {
    mockPOST.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/^new password$/i), 'correcthorse-new')
    await user.type(screen.getByLabelText(/confirm new password/i), 'correcthorse-new')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument()
  })
})
