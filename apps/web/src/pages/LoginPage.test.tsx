import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
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
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
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

  it('returns to the originally requested page after login — e.g. a session timeout while working on a page should not lose that place', async () => {
    mockPOST.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/projects/p1/library' } }]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>projects root stub</div>} />
            <Route path="/projects/p1/library" element={<div>library stub</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    await user.type(await screen.findByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'correcthorse')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('library stub')).toBeInTheDocument()
  })

  it('shows a link to browse public projects when publicProjectsEnabled is true', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') return Promise.resolve({ data: { publicProjectsEnabled: true }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderLogin()

    expect(await screen.findByRole('link', { name: /browse public projects/i })).toHaveAttribute('href', '/')
  })

  it('hides the browse-public-projects link when publicProjectsEnabled is false', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') return Promise.resolve({ data: { publicProjectsEnabled: false }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderLogin()

    await screen.findByLabelText(/email/i)
    expect(screen.queryByRole('link', { name: /browse public projects/i })).not.toBeInTheDocument()
  })

  it('shows a "Forgot password?" link when passwordResetEnabled is true', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { publicProjectsEnabled: false, passwordResetEnabled: true }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderLogin()

    expect(await screen.findByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })

  it('hides the "Forgot password?" link when passwordResetEnabled is false', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { publicProjectsEnabled: false, passwordResetEnabled: false }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderLogin()

    await screen.findByLabelText(/email/i)
    expect(screen.queryByRole('link', { name: /forgot password/i })).not.toBeInTheDocument()
  })

  it('shows a confirmation banner after navigating here from a successful password reset', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { passwordReset: true } }]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument()
  })

  // Generalized one-shot banner (add-first-run-setup): SetupPage reuses the
  // same mechanism to show an arbitrary message after losing the first-run
  // setup race, not just the hardcoded password-reset text.
  it('shows an arbitrary router-state message via the same one-shot banner mechanism', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/login', state: { message: 'This instance has already been set up — log in with an existing account.' } },
        ]}
      >
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/this instance has already been set up/i)).toBeInTheDocument()
  })

  it('clears the router-state message after dismissing, so a refresh does not re-show it', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { message: 'Some one-shot message.' } }]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    const banner = await screen.findByText('Some one-shot message.')
    const dismiss = screen.getByRole('button', { name: /dismiss/i })
    const user = userEvent.setup()
    await user.click(dismiss)

    expect(banner).not.toBeInTheDocument()
  })

  it('shows both the password form and a Sign in with SSO action when SSO is configured', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { publicProjectsEnabled: false, ssoEnabled: true, ssoOnly: false }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderLogin()

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument()
    const ssoLink = await screen.findByRole('link', { name: /sign in with sso/i })
    expect(ssoLink).toHaveAttribute('href', '/api/v1/auth/oidc/login')
  })

  it('hides the password form entirely when SSO-only is enabled', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { publicProjectsEnabled: false, ssoEnabled: true, ssoOnly: true }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderLogin()

    expect(await screen.findByRole('link', { name: /sign in with sso/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('renders exactly as before when SSO is not configured', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { publicProjectsEnabled: false, ssoEnabled: false, ssoOnly: false }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderLogin()

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign in with sso/i })).not.toBeInTheDocument()
  })

  it('falls back to the projects root when there is no redirect-back location', async () => {
    mockPOST.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>projects root stub</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    await user.type(await screen.findByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'correcthorse')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('projects root stub')).toBeInTheDocument()
  })
})
