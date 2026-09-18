import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ProjectSettingsPage from './ProjectSettingsPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPATCH = vi.mocked(api.PATCH)
const mockDELETE = vi.mocked(api.DELETE)

const project = {
  id: 'p1', key: 'QA', name: 'QA Platform', archived: false, description: '', isSample: false,
  publicAccess: false, autoArchiveExempt: false, assigneeRestrictedRecording: false, landingView: null, createdAt: '',
}

function mockAPI({
  manageProject = true,
  publicProjectsEnabled = true,
  projectDelete = false,
  archived = false,
  isTenantAdmin = false,
  autoArchiveExempt = false,
  autoArchiveInactiveDays = 0,
  assigneeRestrictedRecording = false,
  landingView = null,
  defaultLandingView = 'dashboard',
  summaries,
}: {
  manageProject?: boolean
  publicProjectsEnabled?: boolean
  projectDelete?: boolean
  archived?: boolean
  isTenantAdmin?: boolean
  autoArchiveExempt?: boolean
  autoArchiveInactiveDays?: number
  assigneeRestrictedRecording?: boolean
  landingView?: string | null
  defaultLandingView?: string
  summaries?: { projectId: string; suiteCount: number; caseCount: number; passRate: number | null; isFavorite: boolean; archived: boolean }[]
} = {}) {
  const resolvedSummaries = summaries ?? [{ projectId: 'p1', suiteCount: 3, caseCount: 12, passRate: null, isFavorite: false, archived }]
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'u1', email: 'admin@example.com', isTenantAdmin }, response: { ok: true } })
    }
    if (path === '/api/v1/projects/{projectKey}') {
      return Promise.resolve({ data: { ...project, archived, autoArchiveExempt, assigneeRestrictedRecording, landingView }, response: { ok: true } })
    }
    if (path === '/api/v1/projects/{projectKey}/permissions') {
      return Promise.resolve({
        data: {
          read: true, caseCreate: false, caseEdit: false, caseDelete: false, sectionCreate: false,
          sectionDelete: false, suiteCreate: false, suiteEditMembership: false, runCreate: false,
          runRecordResult: false, manageProject, runDelete: false, projectDelete,
        },
        response: { ok: true },
      })
    }
    if (path === '/api/v1/meta') {
      return Promise.resolve({ data: { name: 'TestPulse', version: '0.0.1', publicProjectsEnabled, defaultLandingView }, response: { ok: true } })
    }
    if (path === '/api/v1/projects/summaries') {
      return Promise.resolve({ data: resolvedSummaries, response: { ok: true } })
    }
    if (path === '/api/v1/projects/{projectKey}/custom-fields') {
      return Promise.resolve({ data: [], response: { ok: true } })
    }
    if (path === '/api/v1/instance-settings') {
      return isTenantAdmin
        ? Promise.resolve({
            data: { publicProjectsEnabled, runRetentionDays: 0, autoArchiveInactiveDays, updatedAt: '' },
            response: { ok: true },
          })
        : Promise.resolve({ data: undefined, response: { ok: false, status: 403 } as Response })
    }
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/QA/settings']}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/settings" element={<ProjectSettingsPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ProjectSettingsPage', () => {
  it('shows a not-authorized message without manageProject permission', async () => {
    mockAPI({ manageProject: false })
    renderPage()
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument()
    expect(screen.queryByText(/public access/i)).not.toBeInTheDocument()
  })

  it('renders the Custom fields card', async () => {
    mockAPI({ manageProject: true })
    renderPage()
    expect(await screen.findByText('Custom fields')).toBeInTheDocument()
    expect(await screen.findByText(/no custom fields yet/i)).toBeInTheDocument()
  })

  it('renders the public access toggle off by default and a copyable link once enabled', async () => {
    mockAPI({ manageProject: true })
    mockPATCH.mockResolvedValue({ data: { ...project, publicAccess: true }, response: { ok: true } })
    renderPage()

    const toggle = await screen.findByRole('switch', { name: /public access/i })
    expect(toggle).not.toBeChecked()
    expect(screen.queryByText(/\/projects\/QA/)).not.toBeInTheDocument()

    await userEvent.click(toggle)

    await waitFor(() =>
      expect(mockPATCH).toHaveBeenCalledWith('/api/v1/projects/{projectKey}', {
        params: { path: { projectKey: 'QA' } },
        body: { publicAccess: true },
      }),
    )
    // The shareable link is the project's own unified URL
    // (unify-authenticated-and-public-views) — not the retired
    // /public/{key} shape, which now only exists as a redirect.
    expect(await screen.findByText(/\/projects\/QA/)).toBeInTheDocument()
  })

  it('shows the toggle grayed out with an explanation when the instance-wide switch is off', async () => {
    mockAPI({ manageProject: true, publicProjectsEnabled: false })
    renderPage()

    await screen.findByRole('switch', { name: /public access/i })
    expect(await screen.findByText(/turned off for this instance/i)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /public access/i })).toBeDisabled()
  })

  describe('Assignee-restricted recording (restrict-run-item-status-to-assignee)', () => {
    it('renders the toggle off by default and PATCHes assigneeRestrictedRecording: true on toggle', async () => {
      mockAPI({ manageProject: true })
      mockPATCH.mockResolvedValue({ data: { ...project, assigneeRestrictedRecording: true }, response: { ok: true } })
      renderPage()

      const toggle = await screen.findByRole('switch', { name: /restrict.*assignee/i })
      expect(toggle).not.toBeChecked()

      await userEvent.click(toggle)

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/projects/{projectKey}', {
          params: { path: { projectKey: 'QA' } },
          body: { assigneeRestrictedRecording: true },
        }),
      )
    })

    it('renders the toggle checked when already enabled', async () => {
      mockAPI({ manageProject: true, assigneeRestrictedRecording: true })
      renderPage()

      expect(await screen.findByRole('switch', { name: /restrict.*assignee/i, checked: true })).toBeInTheDocument()
    })
  })

  describe('Landing view (add-configurable-project-landing)', () => {
    it('shows "Use instance default" selected with the resolved default inline, plus the five explicit choices', async () => {
      mockAPI({ manageProject: true, landingView: null, defaultLandingView: 'library' })
      renderPage()

      const group = within(await screen.findByRole('group', { name: 'Landing view' }))
      await waitFor(() => expect(group.getByRole('button', { name: /use instance default/i })).toHaveTextContent(/library/i))
      const useDefault = group.getByRole('button', { name: /use instance default/i })
      expect(useDefault).toHaveAttribute('aria-pressed', 'true')
      for (const label of ['Dashboard', 'Library', 'Suites', 'Runs', 'Reports']) {
        expect(group.getByRole('button', { name: label })).toBeInTheDocument()
      }
    })

    it('shows the override selected when set, not "Use instance default"', async () => {
      mockAPI({ manageProject: true, landingView: 'suites', defaultLandingView: 'dashboard' })
      renderPage()

      const group = within(await screen.findByRole('group', { name: 'Landing view' }))
      await waitFor(() => expect(group.getByRole('button', { name: 'Suites' })).toHaveAttribute('aria-pressed', 'true'))
      expect(group.getByRole('button', { name: /use instance default/i })).toHaveAttribute('aria-pressed', 'false')
    })

    it('selecting an explicit view PATCHes landingView', async () => {
      mockAPI({ manageProject: true, landingView: null, defaultLandingView: 'dashboard' })
      mockPATCH.mockResolvedValue({ data: { ...project, landingView: 'runs' }, response: { ok: true } })
      renderPage()

      const group = within(await screen.findByRole('group', { name: 'Landing view' }))
      await userEvent.click(group.getByRole('button', { name: 'Runs' }))

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/projects/{projectKey}', {
          params: { path: { projectKey: 'QA' } },
          body: { landingView: 'runs' },
        }),
      )
    })

    it('selecting "Use instance default" PATCHes clearLandingView: true', async () => {
      mockAPI({ manageProject: true, landingView: 'suites', defaultLandingView: 'dashboard' })
      mockPATCH.mockResolvedValue({ data: { ...project, landingView: null }, response: { ok: true } })
      renderPage()

      const group = within(await screen.findByRole('group', { name: 'Landing view' }))
      await userEvent.click(group.getByRole('button', { name: /use instance default/i }))

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/projects/{projectKey}', {
          params: { path: { projectKey: 'QA' } },
          body: { clearLandingView: true },
        }),
      )
    })
  })

  describe('Archive / Delete project (add-data-retention)', () => {
    it('renders the Archive switch unchecked for an active project, and PATCHes archived: true on toggle', async () => {
      mockAPI({ archived: false })
      mockPATCH.mockResolvedValue({ data: { ...project, archived: true }, response: { ok: true } })
      renderPage()

      await screen.findByText(/^active$/i)
      const toggle = screen.getByRole('switch', { name: /archive project/i })
      expect(toggle).not.toBeChecked()

      await userEvent.click(toggle)

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/projects/{projectKey}', {
          params: { path: { projectKey: 'QA' } },
          body: { archived: true },
        }),
      )
    })

    it('renders the Archive switch checked for an archived project, and PATCHes archived: false on toggle', async () => {
      mockAPI({ archived: true })
      mockPATCH.mockResolvedValue({ data: { ...project, archived: false }, response: { ok: true } })
      renderPage()

      await screen.findByText(/^archived$/i)
      const toggle = screen.getByRole('switch', { name: /archive project/i })
      expect(toggle).toBeChecked()

      await userEvent.click(toggle)

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/projects/{projectKey}', {
          params: { path: { projectKey: 'QA' } },
          body: { archived: false },
        }),
      )
    })

    it('does not show a Delete project card for an active project, even with projectDelete', async () => {
      mockAPI({ archived: false, projectDelete: true })
      renderPage()
      await screen.findByRole('switch', { name: /archive project/i })
      expect(screen.queryByRole('button', { name: /^delete project$/i })).not.toBeInTheDocument()
    })

    it('does not show a Delete project card for an archived project without projectDelete', async () => {
      mockAPI({ archived: true, projectDelete: false })
      renderPage()
      await screen.findByRole('switch', { name: /archive project/i })
      expect(screen.queryByRole('button', { name: /^delete project$/i })).not.toBeInTheDocument()
    })

    it('shows a Delete project card for an archived project with projectDelete, with a confirmation showing real counts', async () => {
      mockAPI({ archived: true, projectDelete: true })
      const user = userEvent.setup()
      renderPage()

      await user.click(await screen.findByRole('button', { name: /^delete project$/i }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/delete "qa platform"/i)).toBeInTheDocument()
      expect(await within(dialog).findByText(/3 suites?/i)).toBeInTheDocument()
      expect(within(dialog).getByText(/12 cases?/i)).toBeInTheDocument()
      expect(within(dialog).getByText(/background/i)).toBeInTheDocument()
    })

    it('confirming delete calls DELETE on the project', async () => {
      mockAPI({ archived: true, projectDelete: true })
      mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true, status: 202 } as Response })
      const user = userEvent.setup()
      renderPage()

      await user.click(await screen.findByRole('button', { name: /^delete project$/i }))
      const dialog = await screen.findByRole('dialog')
      await within(dialog).findByText(/3 suites?/i)
      await user.click(within(dialog).getByRole('button', { name: /^delete project$/i }))

      await waitFor(() =>
        expect(mockDELETE).toHaveBeenCalledWith('/api/v1/projects/{projectKey}', {
          params: { path: { projectKey: 'QA' } },
        }),
      )
    })
  })

  describe('Auto-archive exemption (add-data-retention D9)', () => {
    it('shows no exemption control for a non-Tenant-Admin (cannot read the instance threshold)', async () => {
      mockAPI({ isTenantAdmin: false, autoArchiveInactiveDays: 30 })
      renderPage()
      await screen.findByRole('switch', { name: /archive project/i })
      expect(screen.queryByRole('switch', { name: /auto-archive exemption/i })).not.toBeInTheDocument()
    })

    it('a Tenant Admin sees a full explanation of the policy when the instance threshold is 0', async () => {
      mockAPI({ isTenantAdmin: true, autoArchiveInactiveDays: 0, autoArchiveExempt: false })
      renderPage()
      await screen.findByRole('switch', { name: /auto-archive exemption/i })
      expect(screen.getByText(/policy is currently off/i)).toBeInTheDocument()
      expect(screen.getByText(/follows the instance-wide policy above/i)).toBeInTheDocument()
    })

    it('a Tenant Admin sees the threshold explained in full and unchecked exemption for a non-exempt project', async () => {
      mockAPI({ isTenantAdmin: true, autoArchiveInactiveDays: 45, autoArchiveExempt: false })
      renderPage()
      const toggle = await screen.findByRole('switch', { name: /auto-archive exemption/i })
      expect(toggle).not.toBeChecked()
      expect(screen.getByText(/automatically archives any project after 45 days/i)).toBeInTheDocument()
      expect(screen.getByText(/no new runs, case edits, or suites/i)).toBeInTheDocument()
      expect(screen.getByText(/follows the instance-wide policy above/i)).toBeInTheDocument()
    })

    it('a Tenant Admin sees the checked exemption and a full explanation for an exempt project', async () => {
      mockAPI({ isTenantAdmin: true, autoArchiveInactiveDays: 45, autoArchiveExempt: true })
      renderPage()
      const toggle = await screen.findByRole('switch', { name: /auto-archive exemption/i })
      expect(toggle).toBeChecked()
      expect(screen.getByText(/will never be archived automatically/i)).toBeInTheDocument()
      expect(screen.getByText(/can still be archived manually at any time/i)).toBeInTheDocument()
    })

    it('toggling the exemption PATCHes autoArchiveExempt', async () => {
      mockAPI({ isTenantAdmin: true, autoArchiveInactiveDays: 45, autoArchiveExempt: false })
      mockPATCH.mockResolvedValue({ data: { ...project, autoArchiveExempt: true }, response: { ok: true } })
      renderPage()
      const toggle = await screen.findByRole('switch', { name: /auto-archive exemption/i })

      await userEvent.click(toggle)

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/projects/{projectKey}', {
          params: { path: { projectKey: 'QA' } },
          body: { autoArchiveExempt: true },
        }),
      )
    })
  })
})
