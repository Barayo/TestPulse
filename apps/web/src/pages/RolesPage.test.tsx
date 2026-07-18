import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RolesPage from './RolesPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPATCH = vi.mocked(api.PATCH)
const mockDELETE = vi.mocked(api.DELETE)

const roles = [
  {
    id: 'r1',
    name: 'Tester',
    rank: 1,
    canRead: true,
    canCaseCreate: false,
    canCaseEdit: false,
    canCaseDelete: false,
    canSectionCreate: false,
    canSectionDelete: false,
    canSuiteCreate: false,
    canSuiteEditMembership: false,
    canRunCreate: true,
    canRunRecordResult: true,
    canManageProject: false,
    createdAt: '',
  },
  {
    id: 'r2',
    name: 'Contributor',
    rank: 2,
    canRead: true,
    canCaseCreate: true,
    canCaseEdit: true,
    canCaseDelete: false,
    canSectionCreate: true,
    canSectionDelete: false,
    canSuiteCreate: true,
    canSuiteEditMembership: true,
    canRunCreate: true,
    canRunRecordResult: true,
    canManageProject: false,
    createdAt: '',
  },
]

function mockAsTenantAdmin(isTenantAdmin: boolean) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'admin1', email: 'admin@example.com', isTenantAdmin }, response: { ok: true } })
    }
    if (path === '/api/v1/roles') return Promise.resolve({ data: roles, response: { ok: true } })
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
        <RolesPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

// Waits for the roles list to finish loading, anchored on Tester's delete
// trigger.
async function waitForLoaded() {
  return screen.findByRole('button', { name: 'Delete Tester' })
}

describe('RolesPage', () => {
  it('lists roles with their permission flags for a Tenant Admin', async () => {
    mockAsTenantAdmin(true)
    renderPage()
    await waitForLoaded()
    expect(screen.getAllByText('Tester').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Contributor').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Tester — Read')).toBeChecked()
    expect(screen.getByLabelText('Tester — Create Case')).not.toBeChecked()
    expect(screen.getByLabelText('Contributor — Create Case')).toBeChecked()
  })

  it('shows a not-authorized message for a non-Tenant-Admin', async () => {
    mockAsTenantAdmin(false)
    renderPage()
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument()
    expect(screen.queryByText('Tester')).not.toBeInTheDocument()
  })

  it('does not show the create-role form until "New role" is clicked — creating a role is rare, not the default view', async () => {
    mockAsTenantAdmin(true)
    renderPage()

    await waitForLoaded()
    expect(screen.queryByLabelText(/role name/i)).not.toBeInTheDocument()
  })

  it('shows the create-role form inline on the page, not as a modal dialog, when "New role" is clicked', async () => {
    mockAsTenantAdmin(true)
    const user = userEvent.setup()
    renderPage()

    await waitForLoaded()
    await user.click(screen.getByRole('button', { name: /new role/i }))

    expect(screen.getByLabelText(/role name/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the inline create-role form on Cancel', async () => {
    mockAsTenantAdmin(true)
    const user = userEvent.setup()
    renderPage()

    await waitForLoaded()
    await user.click(screen.getByRole('button', { name: /new role/i }))
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByLabelText(/role name/i)).not.toBeInTheDocument()
  })

  it('creates a role via the form with name and permission flags', async () => {
    mockAsTenantAdmin(true)
    mockPOST.mockResolvedValue({
      data: { ...roles[0], id: 'r3', name: 'Reviewer' },
      response: { ok: true },
    })
    const user = userEvent.setup()
    renderPage()

    await waitForLoaded()
    await user.click(screen.getByRole('button', { name: /new role/i }))
    await user.type(screen.getByLabelText(/role name/i), 'Reviewer')
    await user.click(screen.getByLabelText('New role — Read'))
    await user.click(screen.getByRole('button', { name: /create role/i }))

    await waitFor(() =>
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/roles',
        expect.objectContaining({
          body: expect.objectContaining({ name: 'Reviewer', canRead: true, canCaseCreate: false }),
        }),
      ),
    )
    expect(screen.queryByLabelText(/role name/i)).not.toBeInTheDocument()
  })

  it('does not show a Rank field — rank is not a user-facing concept, roles are ordered alphabetically instead', async () => {
    mockAsTenantAdmin(true)
    const user = userEvent.setup()
    renderPage()

    await waitForLoaded()
    await user.click(screen.getByRole('button', { name: /new role/i }))
    expect(screen.queryByLabelText(/rank/i)).not.toBeInTheDocument()
  })

  it('lists roles alphabetically by name rather than by rank', async () => {
    mockAsTenantAdmin(true)
    renderPage()
    await waitForLoaded()

    const deleteButtons = screen.getAllByRole('button', { name: /^delete /i })
    expect(deleteButtons.map((b) => b.getAttribute('aria-label'))).toEqual(['Delete Contributor', 'Delete Tester'])
  })

  it('toggles a permission flag on an existing role via PATCH', async () => {
    mockAsTenantAdmin(true)
    mockPATCH.mockResolvedValue({ data: roles[0], response: { ok: true } })
    const user = userEvent.setup()
    renderPage()

    await waitForLoaded()
    await user.click(screen.getByLabelText('Tester — Create Case'))

    await waitFor(() =>
      expect(mockPATCH).toHaveBeenCalledWith(
        '/api/v1/roles/{roleId}',
        expect.objectContaining({
          params: { path: { roleId: 'r1' } },
          body: expect.objectContaining({ canCaseCreate: true }),
        }),
      ),
    )
  })

  it('groups permission flags into resource sections, in both the create form and each role', async () => {
    mockAsTenantAdmin(true)
    const user = userEvent.setup()
    renderPage()
    await waitForLoaded()

    const testerRow = screen.getByText('Tester').closest('li')
    expect(testerRow).not.toBeNull()
    for (const heading of ['Cases', 'Sections', 'Suites', 'Runs', 'Project']) {
      expect(within(testerRow as HTMLElement).getByText(heading)).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: /new role/i }))
    const newRoleForm = screen.getByLabelText(/role name/i).closest('form')
    expect(newRoleForm).not.toBeNull()
    for (const heading of ['Cases', 'Sections', 'Suites', 'Runs', 'Project']) {
      expect(within(newRoleForm as HTMLElement).getByText(heading)).toBeInTheDocument()
    }
  })

  describe('delete role', () => {
    it('does not delete immediately — opens a confirmation dialog naming the role first', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()

      await user.click(await waitForLoaded())

      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent(/tester/i)
      expect(mockDELETE).not.toHaveBeenCalled()
    })

    it('warns that deleting a role removes its project and team assignments', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()

      await user.click(await waitForLoaded())

      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent(/assignment/i)
      expect(dialog).toHaveTextContent(/cannot be undone/i)
    })

    it('cancelling the dialog does not call the delete endpoint', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()

      await user.click(await waitForLoaded())
      await screen.findByRole('dialog')
      await user.click(screen.getByRole('button', { name: /^cancel$/i }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(mockDELETE).not.toHaveBeenCalled()
    })

    it('confirming the dialog calls DELETE and refreshes the list', async () => {
      mockAsTenantAdmin(true)
      mockDELETE.mockResolvedValue({ response: { ok: true } })
      const user = userEvent.setup()
      renderPage()

      await user.click(await waitForLoaded())
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /delete role/i }))

      await waitFor(() =>
        expect(mockDELETE).toHaveBeenCalledWith('/api/v1/roles/{roleId}', {
          params: { path: { roleId: 'r1' } },
        }),
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('reset to defaults', () => {
    it('does not reset immediately — opens a confirmation dialog first', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()

      await waitForLoaded()
      await user.click(screen.getByRole('button', { name: /reset to defaults/i }))

      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(mockPOST).not.toHaveBeenCalledWith('/api/v1/roles/reset', expect.anything())
    })

    it('warns that it restores Tester/Contributor/Project Admin, not that it deletes every role', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()

      await waitForLoaded()
      await user.click(screen.getByRole('button', { name: /reset to defaults/i }))

      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent(/tester/i)
      expect(dialog).toHaveTextContent(/contributor/i)
      expect(dialog).toHaveTextContent(/project admin/i)
    })

    it('cancelling the dialog does not call the reset endpoint', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()

      await waitForLoaded()
      await user.click(screen.getByRole('button', { name: /reset to defaults/i }))
      await screen.findByRole('dialog')
      await user.click(screen.getByRole('button', { name: /^cancel$/i }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(mockPOST).not.toHaveBeenCalledWith('/api/v1/roles/reset', expect.anything())
    })

    it('confirming the dialog calls POST /api/v1/roles/reset and refreshes the list', async () => {
      mockAsTenantAdmin(true)
      mockPOST.mockResolvedValue({ data: roles, response: { ok: true } })
      const user = userEvent.setup()
      renderPage()

      await waitForLoaded()
      await user.click(screen.getByRole('button', { name: /reset to defaults/i }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /reset to defaults/i }))

      await waitFor(() => expect(mockPOST).toHaveBeenCalledWith('/api/v1/roles/reset', expect.anything()))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
