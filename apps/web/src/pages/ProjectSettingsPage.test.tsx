import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ProjectSettingsPage from './ProjectSettingsPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), PATCH: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPATCH = vi.mocked(api.PATCH)

const project = { id: 'p1', key: 'QA', name: 'QA Platform', archived: false, description: '', isSample: false, publicAccess: false, createdAt: '' }

function mockAPI({ manageProject = true, publicProjectsEnabled = true } = {}) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'u1', email: 'admin@example.com', isTenantAdmin: false }, response: { ok: true } })
    }
    if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: project, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions') {
      return Promise.resolve({
        data: {
          read: true, caseCreate: false, caseEdit: false, caseDelete: false, sectionCreate: false,
          sectionDelete: false, suiteCreate: false, suiteEditMembership: false, runCreate: false,
          runRecordResult: false, manageProject,
        },
        response: { ok: true },
      })
    }
    if (path === '/api/v1/meta') {
      return Promise.resolve({ data: { name: 'TestPulse', version: '0.0.1', publicProjectsEnabled }, response: { ok: true } })
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
})
