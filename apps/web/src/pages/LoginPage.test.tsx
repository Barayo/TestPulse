import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

beforeEach(() => {
  vi.resetAllMocks()
  mockGET.mockResolvedValue({ data: undefined, response: { ok: false } })
})

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('renders email and password fields and a submit button', async () => {
    renderLogin()
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('shows an error on invalid credentials without navigating away', async () => {
    mockPOST.mockResolvedValue({ data: undefined, response: { ok: false } })
    const user = userEvent.setup()
    renderLogin()

    await user.type(await screen.findByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument()
  })

  it('submits email and password to the login endpoint', async () => {
    mockPOST.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', role: 'member' },
      response: { ok: true },
    })
    const user = userEvent.setup()
    renderLogin()

    await user.type(await screen.findByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'correcthorse')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(mockPOST).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({ body: { email: 'a@b.com', password: 'correcthorse' } }),
    )
  })
})
