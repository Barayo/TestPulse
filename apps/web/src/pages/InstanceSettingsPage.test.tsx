import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import InstanceSettingsPage from './InstanceSettingsPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), PATCH: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPATCH = vi.mocked(api.PATCH)

function mockAsTenantAdmin(
  isTenantAdmin: boolean,
  publicProjectsEnabled = true,
  runRetentionDays = 0,
  autoArchiveInactiveDays = 0,
) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'admin1', email: 'admin@example.com', isTenantAdmin }, response: { ok: true } })
    }
    if (path === '/api/v1/instance-settings') {
      return Promise.resolve({
        data: { publicProjectsEnabled, runRetentionDays, autoArchiveInactiveDays, updatedAt: '' },
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

function runRetentionGroup() {
  return within(screen.getByRole('group', { name: 'Run retention period' }))
}

function autoArchiveGroup() {
  return within(screen.getByRole('group', { name: 'Auto-archive inactivity period' }))
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

  it('groups the public-access toggle under an "Access" section label', async () => {
    mockAsTenantAdmin(true, true)
    renderPage()
    await screen.findByRole('switch', { name: /public project access/i })
    expect(screen.getByText('Access')).toBeInTheDocument()
  })

  it('shows an "Authentication" section with a disabled, coming-soon SSO row', async () => {
    mockAsTenantAdmin(true, true)
    renderPage()
    await screen.findByRole('switch', { name: /public project access/i })
    expect(screen.getByText('Authentication')).toBeInTheDocument()
    expect(screen.getByText(/require sso sign-in/i)).toBeInTheDocument()
    expect(screen.getByText(/coming with sso/i)).toBeInTheDocument()
  })

  it('toggling it off calls PATCH /instance-settings and reflects the new state', async () => {
    mockAsTenantAdmin(true, true)
    mockPATCH.mockResolvedValue({
      data: { publicProjectsEnabled: false, runRetentionDays: 0, autoArchiveInactiveDays: 0, updatedAt: '' },
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

  describe('Run retention', () => {
    it('groups the run-retention control under a "Data" section label', async () => {
      mockAsTenantAdmin(true, true, 0)
      renderPage()
      await screen.findByRole('switch', { name: /public project access/i })
      expect(screen.getByText('Data')).toBeInTheDocument()
      expect(screen.getByText('Run retention')).toBeInTheDocument()
    })

    it('highlights Off and shows the off message when the threshold is 0', async () => {
      mockAsTenantAdmin(true, true, 0)
      renderPage()
      await screen.findByRole('group', { name: 'Run retention period' })
      const offPill = runRetentionGroup().getByRole('button', { name: 'Off' })
      expect(offPill).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText(/off — runs are never automatically deleted/i)).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('highlights the matching preset pill and warns when armed', async () => {
      mockAsTenantAdmin(true, true, 90)
      renderPage()
      await screen.findByRole('group', { name: 'Run retention period' })
      const pill = runRetentionGroup().getByRole('button', { name: '90d' })
      await waitFor(() => expect(pill).toHaveAttribute('aria-pressed', 'true'))
      expect(await screen.findByRole('alert')).toHaveTextContent(/90 days/i)
      expect(screen.getByRole('alert')).toHaveTextContent(/cannot be undone/i)
    })

    it('highlights Custom and prefills the input for a non-preset value', async () => {
      mockAsTenantAdmin(true, true, 45)
      renderPage()
      const input = await screen.findByRole('spinbutton', { name: /custom retention period/i })
      expect(input).toHaveValue(45)
      expect(runRetentionGroup().getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('clicking a preset pill saves immediately, with no separate Save step', async () => {
      mockAsTenantAdmin(true, true, 0)
      mockPATCH.mockResolvedValue({
        data: { publicProjectsEnabled: true, runRetentionDays: 90, autoArchiveInactiveDays: 0, updatedAt: '' },
        response: { ok: true },
      })
      renderPage()
      await screen.findByRole('group', { name: 'Run retention period' })
      const pill = runRetentionGroup().getByRole('button', { name: '90d' })

      await userEvent.click(pill)

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/instance-settings', {
          body: { runRetentionDays: 90 },
        }),
      )
      expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    })

    it('entering and committing a custom value saves it without touching publicProjectsEnabled', async () => {
      mockAsTenantAdmin(true, true, 0)
      mockPATCH.mockResolvedValue({
        data: { publicProjectsEnabled: true, runRetentionDays: 10, autoArchiveInactiveDays: 0, updatedAt: '' },
        response: { ok: true },
      })
      renderPage()
      await screen.findByRole('group', { name: 'Run retention period' })
      await userEvent.click(runRetentionGroup().getByRole('button', { name: 'Custom' }))
      const input = screen.getByRole('spinbutton', { name: /custom retention period/i })

      await userEvent.type(input, '10')
      await userEvent.tab()

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/instance-settings', {
          body: { runRetentionDays: 10 },
        }),
      )
    })
  })

  describe('Auto-archive inactive projects', () => {
    it('shows the "Auto-archive inactive projects" card in the Data section', async () => {
      mockAsTenantAdmin(true, true, 0, 0)
      renderPage()
      await screen.findByRole('switch', { name: /public project access/i })
      expect(screen.getByText('Auto-archive inactive projects')).toBeInTheDocument()
    })

    it('highlights Off and shows the off message when the threshold is 0, with no destructive callout', async () => {
      mockAsTenantAdmin(true, true, 0, 0)
      renderPage()
      await screen.findByRole('group', { name: 'Auto-archive inactivity period' })
      const offPill = autoArchiveGroup().getByRole('button', { name: 'Off' })
      expect(offPill).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText(/off — projects are never automatically archived/i)).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows a plain (non-alert) message when armed, unlike Run retention', async () => {
      mockAsTenantAdmin(true, true, 0, 60)
      renderPage()
      // 60 isn't a preset, so it renders via the Custom field instead.
      const input = await screen.findByRole('spinbutton', { name: /custom inactivity period/i })
      expect(input).toHaveValue(60)
      expect(autoArchiveGroup().getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText(/inactive for 60 days are archived automatically/i)).toBeInTheDocument()
      expect(screen.getByText(/reversible any time/i)).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('clicking a preset pill saves immediately and does not affect Run retention', async () => {
      mockAsTenantAdmin(true, true, 0, 0)
      mockPATCH.mockResolvedValue({
        data: { publicProjectsEnabled: true, runRetentionDays: 0, autoArchiveInactiveDays: 365, updatedAt: '' },
        response: { ok: true },
      })
      renderPage()
      await screen.findByRole('group', { name: 'Auto-archive inactivity period' })
      const pill = autoArchiveGroup().getByRole('button', { name: '365d' })

      await userEvent.click(pill)

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/instance-settings', {
          body: { autoArchiveInactiveDays: 365 },
        }),
      )
    })
  })
})
