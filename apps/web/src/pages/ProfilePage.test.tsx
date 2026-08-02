import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ProfilePage from './ProfilePage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPATCH = vi.mocked(api.PATCH)

const meResponse = {
  id: 'u1',
  email: 'ana@example.com',
  isTenantAdmin: false,
  displayName: null,
  avatarKey: null,
  timezone: null,
  createdAt: '',
}

function mockMe(user: unknown = meResponse) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') return Promise.resolve({ data: user, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/profile']}>
      <AuthProvider>
        <Routes>
          <Route path="/settings/profile" element={<ProfilePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ProfilePage', () => {
  it('shows the current display name, avatar, and timezone', async () => {
    mockMe({ ...meResponse, displayName: 'Ana', avatarKey: 'ada-lovelace', timezone: 'Europe/Madrid' })
    renderPage()

    expect(await screen.findByDisplayValue('Ana')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Europe/Madrid')).toBeInTheDocument()
  })

  it('lists every avatar preset plus a generated-default option', async () => {
    mockMe()
    renderPage()
    await screen.findByLabelText(/display name/i)

    expect(screen.getByRole('radio', { name: /ada lovelace/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /emmy noether/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /generated default/i })).toBeInTheDocument()
  })

  it('saving calls PATCH /api/v1/users/me and reflects the update', async () => {
    mockMe()
    mockPATCH.mockResolvedValue({
      data: { ...meResponse, displayName: 'Ana R.', avatarKey: 'grace-hopper', timezone: 'Europe/Madrid' },
      response: { ok: true },
    })
    renderPage()
    const nameInput = await screen.findByLabelText(/display name/i)

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Ana R.')
    await userEvent.click(screen.getByRole('radio', { name: /grace hopper/i }))
    await userEvent.type(screen.getByLabelText(/timezone/i), 'Europe/Madrid')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockPATCH).toHaveBeenCalledWith(
        '/api/v1/users/me',
        expect.objectContaining({
          body: { displayName: 'Ana R.', avatarKey: 'grace-hopper', timezone: 'Europe/Madrid' },
        }),
      )
    })
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
  })

  it('always links to API tokens', async () => {
    mockMe()
    renderPage()
    await screen.findByLabelText(/display name/i)
    expect(screen.getByRole('link', { name: /api tokens/i })).toHaveAttribute('href', '/settings/tokens')
  })

  it('links to Users management only for a tenant admin', async () => {
    mockMe({ ...meResponse, isTenantAdmin: true })
    renderPage()
    await screen.findByLabelText(/display name/i)
    expect(screen.getByRole('link', { name: /manage users/i })).toHaveAttribute('href', '/settings/users')
  })

  it('does not link to Users management for a non-admin', async () => {
    mockMe()
    renderPage()
    await screen.findByLabelText(/display name/i)
    expect(screen.queryByRole('link', { name: /manage users/i })).not.toBeInTheDocument()
  })

  it('shows a disabled password-change entry as a coming-soon placeholder', async () => {
    mockMe()
    renderPage()
    await screen.findByLabelText(/display name/i)
    const changePassword = screen.getByRole('button', { name: /change password/i })
    expect(changePassword).toBeDisabled()
  })
})
