import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import SetupPage from './SetupPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

beforeEach(() => {
  vi.resetAllMocks()
  // AuthProvider's own mount-time checks (/users/me, /api/v1/meta) — not
  // under test in most cases below, so default to the realistic case for
  // this page (an unauthenticated, still-not-set-up instance); the one test
  // about the stale-visit redirect overrides this itself.
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/meta') return Promise.resolve({ data: { setupRequired: true }, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/setup']}>
      <AuthProvider>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/" element={<div>home stub</div>} />
          <Route path="/login" element={<div>login stub</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('SetupPage', () => {
  it('redirects to /login when setupRequired is already false (stale visit)', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta')
        return Promise.resolve({ data: { setupRequired: false }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderPage()
    expect(await screen.findByText('login stub')).toBeInTheDocument()
  })

  it('renders email, password, confirm-password fields, the warning callout, and a submit button', async () => {
    renderPage()
    expect(await screen.findByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByText(/this account becomes the instance administrator/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create admin account/i })).toBeInTheDocument()
  })

  it('has no "back to log in" link — there is nowhere to go back to on first run', async () => {
    renderPage()
    await screen.findByLabelText(/^email$/i)
    expect(screen.queryByRole('link', { name: /back to log in/i })).not.toBeInTheDocument()
  })

  it('rejects empty fields client-side', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText(/^email$/i)

    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(await screen.findByText(/enter a password and confirm it/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('rejects a password under 12 characters client-side', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText(/^email$/i)

    await user.type(screen.getByLabelText(/^email$/i), 'founder@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'short')
    await user.type(screen.getByLabelText(/confirm password/i), 'short')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(await screen.findByText(/password must be at least 12 characters/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords client-side', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText(/^email$/i)

    await user.type(screen.getByLabelText(/^email$/i), 'founder@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'correcthorse-one')
    await user.type(screen.getByLabelText(/confirm password/i), 'correcthorse-two')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('submits email and password, then auto-logs in and lands on / (no confirmation detour)', async () => {
    mockPOST.mockResolvedValue({
      data: { id: 'u1', email: 'founder@example.com', isTenantAdmin: true },
      error: undefined,
      response: { ok: true, status: 200 } as Response,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText(/^email$/i)

    await user.type(screen.getByLabelText(/^email$/i), 'founder@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'correcthorse-battery')
    await user.type(screen.getByLabelText(/confirm password/i), 'correcthorse-battery')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(await screen.findByText('home stub')).toBeInTheDocument()
    expect(mockPOST).toHaveBeenCalledWith(
      '/api/v1/setup',
      expect.objectContaining({ body: { email: 'founder@example.com', password: 'correcthorse-battery' } }),
    )
  })

  it('redirects to /login with an already-set-up message on a 409 (race lost)', async () => {
    mockPOST.mockResolvedValue({
      data: undefined,
      error: { error: 'this instance has already been set up' },
      response: { ok: false, status: 409 } as Response,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText(/^email$/i)

    await user.type(screen.getByLabelText(/^email$/i), 'founder@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'correcthorse-battery')
    await user.type(screen.getByLabelText(/confirm password/i), 'correcthorse-battery')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(await screen.findByText('login stub')).toBeInTheDocument()
  })

  it('shows a network-failure message when the request throws', async () => {
    mockPOST.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText(/^email$/i)

    await user.type(screen.getByLabelText(/^email$/i), 'founder@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'correcthorse-battery')
    await user.type(screen.getByLabelText(/confirm password/i), 'correcthorse-battery')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument()
  })

  describe('Generate password', () => {
    it('fills both password fields with the same generated value and reveals the chip', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByLabelText(/^email$/i)

      await user.click(screen.getByRole('button', { name: /generate/i }))

      const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement
      const confirmInput = screen.getByLabelText(/confirm password/i) as HTMLInputElement
      expect(passwordInput.value).toBe(confirmInput.value)
      expect(passwordInput.value.length).toBeGreaterThanOrEqual(12)
      expect(screen.getByText(passwordInput.value)).toBeInTheDocument()
    })
  })
})
