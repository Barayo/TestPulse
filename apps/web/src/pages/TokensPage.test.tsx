import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TokensPage from './TokensPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockDELETE = vi.mocked(api.DELETE)

beforeEach(() => {
  vi.resetAllMocks()
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({
        data: { id: 'u1', email: 'me@example.com', role: 'member' },
        response: { ok: true },
      })
    }
    if (path === '/api/v1/tokens') {
      return Promise.resolve({
        data: [
          { id: 't1', createdBy: 'u1', name: 'ci-agent', prefix: 'tp_AbCd', revokedAt: null, createdAt: '' },
        ],
        response: { ok: true },
      })
    }
    return Promise.resolve({ data: [], response: { ok: true } })
  })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TokensPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('TokensPage', () => {
  it('lists existing tokens by name and prefix, never the full value', async () => {
    renderPage()
    expect(await screen.findByText('ci-agent')).toBeInTheDocument()
    expect(screen.getByText(/tp_AbCd/)).toBeInTheDocument()
  })

  it('creates a token and shows the full value once with a warning', async () => {
    mockPOST.mockResolvedValue({
      data: {
        id: 't2',
        createdBy: 'u1',
        name: 'new-agent',
        prefix: 'tp_XyZ1',
        revokedAt: null,
        createdAt: '',
        token: 'tp_XyZ1FullSecretValue',
      },
      response: { ok: true },
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /new token/i }))
    await user.type(screen.getByLabelText(/name/i), 'new-agent')
    await user.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByText('tp_XyZ1FullSecretValue')).toBeInTheDocument()
    expect(screen.getByText(/won't be shown again/i)).toBeInTheDocument()
  })

  it('revokes a token', async () => {
    mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /revoke/i }))

    await waitFor(() =>
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/tokens/{tokenId}',
        expect.objectContaining({ params: { path: { tokenId: 't1' } } }),
      ),
    )
  })
})
