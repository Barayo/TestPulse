import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import TokensPage from './TokensPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockDELETE = vi.mocked(api.DELETE)

const unscopedToken = {
  id: 't1',
  createdBy: 'u1',
  name: 'ci-agent',
  prefix: 'tp_AbCd',
  projectId: null,
  roleId: null,
  revokedAt: null,
  createdAt: '',
}
const projects = [{ id: 'p1', key: 'QA', name: 'QA Platform', archived: false, createdAt: '' }]
const roles = [
  { id: 'r1', name: 'Viewer' },
  { id: 'r2', name: 'Contributor' },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({
        data: { id: 'u1', email: 'me@example.com', isTenantAdmin: false },
        response: { ok: true },
      })
    }
    if (path === '/api/v1/tokens') {
      return Promise.resolve({ data: [unscopedToken], response: { ok: true } })
    }
    if (path === '/api/v1/projects') {
      return Promise.resolve({ data: projects, response: { ok: true } })
    }
    if (path === '/api/v1/roles') {
      return Promise.resolve({ data: { items: roles, nextCursor: null }, response: { ok: true } })
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

  it('copies the newly-created token to the clipboard', async () => {
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
    // Must come after userEvent.setup() — it installs its own clipboard
    // stub (for its copy/cut/paste API), which would otherwise clobber this.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPage()

    await user.click(await screen.findByRole('button', { name: /new token/i }))
    await user.type(screen.getByLabelText(/name/i), 'new-agent')
    await user.click(screen.getByRole('button', { name: /create/i }))
    await screen.findByText('tp_XyZ1FullSecretValue')

    await user.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith('tp_XyZ1FullSecretValue')
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('does not revoke immediately — opens a confirmation dialog naming the token first (redesign-admin-shell)', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /revoke/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/ci-agent/i)
    expect(mockDELETE).not.toHaveBeenCalled()
  })

  it('cancelling the revoke dialog does not call the API', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /revoke/i }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockDELETE).not.toHaveBeenCalled()
  })

  it('confirming the dialog revokes a token', async () => {
    mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /revoke/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^revoke$/i }))

    await waitFor(() =>
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/tokens/{tokenId}',
        expect.objectContaining({ params: { path: { tokenId: 't1' } } }),
      ),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a revoked token as "Revoked" instead of an active Revoke button', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') {
        return Promise.resolve({
          data: { id: 'u1', email: 'me@example.com', isTenantAdmin: false },
          response: { ok: true },
        })
      }
      if (path === '/api/v1/tokens') {
        return Promise.resolve({
          data: [{ ...unscopedToken, id: 't-revoked', name: 'old-agent', revokedAt: '2026-01-01T00:00:00Z' }],
          response: { ok: true },
        })
      }
      if (path === '/api/v1/projects') return Promise.resolve({ data: projects, response: { ok: true } })
      if (path === '/api/v1/roles') return Promise.resolve({ data: { items: roles, nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderPage()
    expect(await screen.findByText('old-agent')).toBeInTheDocument()
    expect(screen.getByText(/revoked/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument()
  })

  it('shows "Full access" for an unscoped token', async () => {
    renderPage()
    expect(await screen.findByText('ci-agent')).toBeInTheDocument()
    expect(screen.getByText(/full access/i)).toBeInTheDocument()
  })

  it('shows the project and role for a scoped token', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') {
        return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin: false }, response: { ok: true } })
      }
      if (path === '/api/v1/tokens') {
        return Promise.resolve({
          data: [{ ...unscopedToken, id: 't-scoped', name: 'viewer-agent', projectId: 'p1', roleId: 'r1' }],
          response: { ok: true },
        })
      }
      if (path === '/api/v1/projects') return Promise.resolve({ data: projects, response: { ok: true } })
      if (path === '/api/v1/roles') return Promise.resolve({ data: { items: roles, nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderPage()
    expect(await screen.findByText('viewer-agent')).toBeInTheDocument()
    expect(screen.getByText(/QA Platform/)).toBeInTheDocument()
    expect(screen.getByText(/Viewer/)).toBeInTheDocument()
    expect(screen.queryByText(/full access/i)).not.toBeInTheDocument()
  })

  // Dual-mode migration precedent (backlog #117, design.md D5): the scope
  // section is collapsed by default — leaving it collapsed must create an
  // unscoped token, byte-for-byte identical to today's request body.
  describe('scoping a new token (design.md D5)', () => {
    it('creates an unscoped token when the scope section is left collapsed', async () => {
      mockPOST.mockResolvedValue({
        data: { ...unscopedToken, id: 't2', name: 'new-agent', token: 'tp_secret' },
        response: { ok: true },
      })
      const user = userEvent.setup()
      renderPage()

      await user.click(await screen.findByRole('button', { name: /new token/i }))
      await user.type(screen.getByLabelText(/^name$/i), 'new-agent')
      await user.click(screen.getByRole('button', { name: /create/i }))

      await waitFor(() =>
        expect(mockPOST).toHaveBeenCalledWith('/api/v1/tokens', { body: { name: 'new-agent' } }),
      )
    })

    it('expanding the scope section shows a project picker, then a role picker once a project is chosen', async () => {
      const user = userEvent.setup()
      renderPage()

      await user.click(await screen.findByRole('button', { name: /new token/i }))
      expect(screen.queryByLabelText(/project/i)).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /scope to a project/i }))
      const projectSelect = await screen.findByLabelText(/project/i)
      expect(within(projectSelect).getByText('QA Platform')).toBeInTheDocument()

      await user.selectOptions(projectSelect, 'p1')
      const roleSelect = await screen.findByLabelText(/^role$/i)
      expect(within(roleSelect).getByText('Viewer')).toBeInTheDocument()
      expect(within(roleSelect).getByText('Contributor')).toBeInTheDocument()
    })

    it('submits projectId/roleId when a scope is picked', async () => {
      mockPOST.mockResolvedValue({
        data: { ...unscopedToken, id: 't3', name: 'scoped-agent', projectId: 'p1', roleId: 'r1', token: 'tp_secret' },
        response: { ok: true },
      })
      const user = userEvent.setup()
      renderPage()

      await user.click(await screen.findByRole('button', { name: /new token/i }))
      await user.type(screen.getByLabelText(/^name$/i), 'scoped-agent')
      await user.click(screen.getByRole('button', { name: /scope to a project/i }))
      await user.selectOptions(await screen.findByLabelText(/project/i), 'p1')
      await user.selectOptions(await screen.findByLabelText(/^role$/i), 'r1')
      await user.click(screen.getByRole('button', { name: /create/i }))

      await waitFor(() =>
        expect(mockPOST).toHaveBeenCalledWith('/api/v1/tokens', {
          body: { name: 'scoped-agent', projectId: 'p1', roleId: 'r1' },
        }),
      )
    })
  })
})
