import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UsersPage from './UsersPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

function mockAsRole(role: 'admin' | 'member') {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({
        data: { id: 'u1', email: 'me@example.com', role },
        response: { ok: true },
      })
    }
    if (path === '/api/v1/users') {
      return Promise.resolve({
        data: [
          { id: 'u1', email: 'me@example.com', role, deactivatedAt: null, createdAt: '' },
          { id: 'u2', email: 'other@example.com', role: 'member', deactivatedAt: null, createdAt: '' },
        ],
        response: { ok: true },
      })
    }
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <UsersPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('UsersPage', () => {
  it('lists users for an admin', async () => {
    mockAsRole('admin')
    renderPage()
    expect(await screen.findByText('other@example.com')).toBeInTheDocument()
  })

  it('shows a not-authorized message for a member', async () => {
    mockAsRole('member')
    renderPage()
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument()
    expect(screen.queryByText('other@example.com')).not.toBeInTheDocument()
  })

  it('creates a user as admin', async () => {
    mockAsRole('admin')
    mockPOST.mockResolvedValue({
      data: { id: 'u3', email: 'new@example.com', role: 'member', deactivatedAt: null, createdAt: '' },
      response: { ok: true },
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /new user/i }))
    await user.type(screen.getByLabelText(/email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/password/i), 'correcthorse')
    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() =>
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/users',
        expect.objectContaining({
          body: { email: 'new@example.com', password: 'correcthorse', role: 'member' },
        }),
      ),
    )
  })
})
