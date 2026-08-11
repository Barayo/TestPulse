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
