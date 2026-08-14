import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import ForgotPasswordPage from './ForgotPasswordPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { POST: vi.fn() } }))
const mockPOST = vi.mocked(api.POST)

beforeEach(() => {
  vi.resetAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )
}

describe('ForgotPasswordPage', () => {
  it('renders an email field and a submit button', () => {
    renderPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('rejects an empty email client-side without calling the API', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/enter your email address/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('always shows the same confirmation, for a real or unknown email alike (server never leaks which)', async () => {
    mockPOST.mockResolvedValue({ data: undefined, error: undefined, response: { ok: true, status: 200 } as Response })
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'anyone@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
    expect(mockPOST).toHaveBeenCalledWith(
      '/api/v1/auth/forgot-password',
      expect.objectContaining({ body: { email: 'anyone@example.com' } }),
    )
  })

  it('shows a rate-limit message on 429 without a generic network error', async () => {
    mockPOST.mockResolvedValue({ data: undefined, error: undefined, response: { ok: false, status: 429 } as Response })
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'anyone@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument()
  })

  it('shows a network-failure message when the request throws', async () => {
    mockPOST.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'anyone@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument()
  })

  it('lets the user go back to the form from the confirmation to try a different email', async () => {
    mockPOST.mockResolvedValue({ data: undefined, error: undefined, response: { ok: true, status: 200 } as Response })
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'anyone@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await screen.findByText(/check your email/i)

    await user.click(screen.getByRole('button', { name: /try a different email/i }))

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })
})
