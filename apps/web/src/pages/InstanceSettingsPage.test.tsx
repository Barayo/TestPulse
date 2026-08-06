import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import InstanceSettingsPage from './InstanceSettingsPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), PATCH: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPATCH = vi.mocked(api.PATCH)

function mockAsTenantAdmin(isTenantAdmin: boolean, publicProjectsEnabled = true) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'admin1', email: 'admin@example.com', isTenantAdmin }, response: { ok: true } })
    }
    if (path === '/api/v1/meta') {
      return Promise.resolve({
        data: { name: 'TestPulse', version: '0.0.1', publicProjectsEnabled },
        response: { ok: true },
      })
    }
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <InstanceSettingsPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('InstanceSettingsPage', () => {
  it('shows a not-authorized message for a non-Tenant-Admin', async () => {
    mockAsTenantAdmin(false)
    renderPage()
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument()
    expect(screen.queryByText(/public project access/i)).not.toBeInTheDocument()
  })

  it('renders the toggle in its current state for a Tenant Admin', async () => {
    mockAsTenantAdmin(true, true)
    renderPage()
    const toggle = await screen.findByRole('switch', { name: /public project access/i })
    expect(toggle).toBeChecked()
  })

  it('toggling it off calls PATCH /instance-settings and reflects the new state', async () => {
    mockAsTenantAdmin(true, true)
    mockPATCH.mockResolvedValue({
      data: { publicProjectsEnabled: false, updatedAt: '' },
      response: { ok: true },
    })
    renderPage()
    const toggle = await screen.findByRole('switch', { name: /public project access/i })

    await userEvent.click(toggle)

    await waitFor(() =>
      expect(mockPATCH).toHaveBeenCalledWith('/api/v1/instance-settings', {
        body: { publicProjectsEnabled: false },
      }),
    )
    expect(toggle).not.toBeChecked()
  })
})
