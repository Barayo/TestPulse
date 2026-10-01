import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import InstanceTokensPage from './InstanceTokensPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

const tokens = [
  {
    id: 't1',
    ownerEmail: 'admin@example.com',
    ownerDisplayName: 'Ada Admin',
    name: 'ci-agent',
    prefix: 'tp_ab12cd34',
    projectKey: null,
    roleName: null,
    revokedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 't2',
    ownerEmail: 'other@example.com',
    ownerDisplayName: null,
    name: 'scoped-agent',
    prefix: 'tp_ef56gh78',
    projectKey: 'QA',
    roleName: 'Viewer',
    revokedAt: '2026-02-01T00:00:00Z',
    createdAt: '2026-01-02T00:00:00Z',
  },
]

function mockAsTenantAdmin(isTenantAdmin: boolean, page: { items: unknown[]; nextCursor: string | null } = { items: tokens, nextCursor: null }) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'u1', email: 'admin@example.com', isTenantAdmin }, response: { ok: true } })
    }
    if (path === '/api/v1/tokens/instance') return Promise.resolve({ data: page, response: { ok: true } })
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
        <InstanceTokensPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('InstanceTokensPage', () => {
  it('shows a not-authorized message for a non-Tenant-Admin', async () => {
    mockAsTenantAdmin(false)
    renderPage()
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument()
    expect(screen.queryByText('ci-agent')).not.toBeInTheDocument()
  })

  it("lists every user's tokens with owner, scope, and status", async () => {
    mockAsTenantAdmin(true)
    renderPage()

    expect(await screen.findByText('Ada Admin')).toBeInTheDocument()
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('ci-agent')).toBeInTheDocument()
    expect(screen.getByText('Full access')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()

    // Second token: no display name, so email alone is the identity line;
    // scoped shows project key and role name, and is revoked.
    expect(screen.getByText('other@example.com')).toBeInTheDocument()
    expect(screen.getByText('QA · Viewer')).toBeInTheDocument()
    expect(screen.getByText('Revoked')).toBeInTheDocument()
  })

  it('shows an empty state when no tokens exist', async () => {
    mockAsTenantAdmin(true, { items: [], nextCursor: null })
    renderPage()

    expect(await screen.findByText(/no agent tokens yet/i)).toBeInTheDocument()
  })
})
