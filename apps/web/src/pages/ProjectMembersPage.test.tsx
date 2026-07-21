import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProjectMembersPage from './ProjectMembersPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

const roles = [
  { id: 'r-tester', name: 'Tester', rank: 1, canRead: true, canRunCreate: true, canRunRecordResult: true, canCaseCreate: false, canManageProject: false, createdAt: '' },
  { id: 'r-contributor', name: 'Contributor', rank: 2, canRead: true, canRunCreate: true, canRunRecordResult: true, canCaseCreate: true, canManageProject: false, createdAt: '' },
]
const membership = {
  users: [{ userId: 'u1', roleId: 'r-contributor' }],
  teams: [{ teamId: 't1', roleId: 'r-tester' }],
}
const users = [
  { id: 'u1', email: 'jane@example.com', isTenantAdmin: false, deactivatedAt: null, createdAt: '' },
  { id: 'u2', email: 'bob@example.com', isTenantAdmin: false, deactivatedAt: null, createdAt: '' },
]
const teams = [{ id: 't1', name: 'QA Core', memberIds: [], createdAt: '' }]

function mockAPI(isTenantAdmin: boolean) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'admin1', email: 'admin@example.com', isTenantAdmin }, response: { ok: true } })
    }
    if (path === '/api/v1/projects/{projectKey}') {
      return Promise.resolve({ data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' }, response: { ok: true } })
    }
    if (path === '/api/v1/projects/{projectKey}/members') return Promise.resolve({ data: membership, response: { ok: true } })
    if (path === '/api/v1/users') return Promise.resolve({ data: users, response: { ok: true } })
    if (path === '/api/v1/teams') return Promise.resolve({ data: teams, response: { ok: true } })
    if (path === '/api/v1/roles') return Promise.resolve({ data: roles, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/members']}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/members" element={<ProjectMembersPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ProjectMembersPage', () => {
  it('lists direct members and assigned teams with their roles', async () => {
    mockAPI(true)
    renderPage()
    expect(await screen.findByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /role for jane@example.com/i })).toHaveValue('r-contributor')
    expect(screen.getByText('QA Core')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /role for qa core/i })).toHaveValue('r-tester')
  })

  it('renders role names fetched from GET /api/v1/roles rather than hardcoding them', async () => {
    mockAPI(true)
    renderPage()
    await screen.findByText('jane@example.com')
    const select = screen.getByRole('combobox', { name: /role for jane@example.com/i })
    expect(select).toHaveTextContent('Tester')
    expect(select).toHaveTextContent('Contributor')
  })

  it('lets a Tenant Admin add a user with a role', async () => {
    mockAPI(true)
    mockPUT.mockResolvedValue({ response: { ok: true } })
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('jane@example.com')
    await user.click(screen.getByRole('button', { name: /add member/i }))
    await user.click(await screen.findByText('bob@example.com'))

    await waitFor(() =>
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/members/{userId}',
        expect.objectContaining({
          params: { path: { projectKey: 'p1', userId: 'u2' } },
          body: { roleId: 'r-tester' },
        }),
      ),
    )
  })

  describe('remove a member', () => {
    it('does not remove immediately — opens a confirmation dialog naming the member first', async () => {
      mockAPI(true)
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('jane@example.com')
      await user.click(screen.getByRole('button', { name: /remove jane@example.com/i }))

      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent(/jane@example.com/i)
      expect(mockDELETE).not.toHaveBeenCalled()
    })

    it('cancelling the dialog does not call the API', async () => {
      mockAPI(true)
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('jane@example.com')
      await user.click(screen.getByRole('button', { name: /remove jane@example.com/i }))
      await screen.findByRole('dialog')
      await user.click(screen.getByRole('button', { name: /^cancel$/i }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(mockDELETE).not.toHaveBeenCalled()
    })

    it('confirming the dialog removes the member', async () => {
      mockAPI(true)
      mockDELETE.mockResolvedValue({ response: { ok: true } })
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('jane@example.com')
      await user.click(screen.getByRole('button', { name: /remove jane@example.com/i }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /^remove$/i }))

      await waitFor(() =>
        expect(mockDELETE).toHaveBeenCalledWith('/api/v1/projects/{projectKey}/members/{userId}', {
          params: { path: { projectKey: 'p1', userId: 'u1' } },
        }),
      )
    })
  })

  describe('remove a team\'s role assignment', () => {
    it('does not remove immediately — opens a confirmation dialog naming the team first', async () => {
      mockAPI(true)
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('QA Core')
      await user.click(screen.getByRole('button', { name: /remove qa core/i }))

      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent(/qa core/i)
      expect(mockDELETE).not.toHaveBeenCalled()
    })

    it('confirming the dialog removes the team\'s role assignment', async () => {
      mockAPI(true)
      mockDELETE.mockResolvedValue({ response: { ok: true } })
      const user = userEvent.setup()
      renderPage()

      await screen.findByText('QA Core')
      await user.click(screen.getByRole('button', { name: /remove qa core/i }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /^remove$/i }))

      await waitFor(() =>
        expect(mockDELETE).toHaveBeenCalledWith('/api/v1/projects/{projectKey}/teams/{teamId}', {
          params: { path: { projectKey: 'p1', teamId: 't1' } },
        }),
      )
    })
  })

  it('shows a not-authorized message for a non-Tenant-Admin', async () => {
    mockAPI(false)
    renderPage()
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument()
  })
})
