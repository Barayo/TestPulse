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
  colorTheme = 'teal',
  jiraSiteUrl = '',
  sessionTimeoutDays = 30,
  defaultLandingView = 'dashboard',
  mcpEnabled = true,
) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'admin1', email: 'admin@example.com', isTenantAdmin }, response: { ok: true } })
    }
    if (path === '/api/v1/instance-settings') {
      return Promise.resolve({
        data: {
          publicProjectsEnabled,
          runRetentionDays,
          autoArchiveInactiveDays,
          colorTheme,
          jiraSiteUrl,
          sessionTimeoutDays,
          defaultLandingView,
          updatedAt: '',
        },
        response: { ok: true },
      })
    }
    // useAuth's own fetch (mcp-admin-discoverability-card's mcpEnabled) — a
    // separate call from /api/v1/instance-settings above, same as every
    // other AuthProvider-sourced field this page reads.
    if (path === '/api/v1/meta') {
      return Promise.resolve({ data: { setupRequired: false, colorTheme, mcpEnabled }, response: { ok: true } })
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
    // The switch renders once, disabled and unchecked, before the settings
    // fetch resolves — matching on `checked: true` makes the query itself
    // wait for that settled render instead of the transient loading one
    // (a real race, just usually too fast to observe outside a
    // resource-constrained CI-equivalent environment like `act`).
    const toggle = await screen.findByRole('switch', { name: /public project access/i, checked: true })
    expect(toggle).toBeChecked()
  })

  it('groups the public-access toggle under an "Access" section label', async () => {
    mockAsTenantAdmin(true, true)
    renderPage()
    await screen.findByRole('switch', { name: /public project access/i })
    expect(screen.getByText('Access')).toBeInTheDocument()
  })

  it('shows an "Authentication" section with the Single sign-on card', async () => {
    mockAsTenantAdmin(true, true)
    renderPage()
    await screen.findByRole('switch', { name: /public project access/i })
    expect(screen.getByText('Authentication')).toBeInTheDocument()
    expect(await screen.findByText('Single sign-on')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /sso-only/i })).toBeDisabled()
  })

  it('toggling it off calls PATCH /instance-settings and reflects the new state', async () => {
    mockAsTenantAdmin(true, true)
    mockPATCH.mockResolvedValue({
      data: { publicProjectsEnabled: false, runRetentionDays: 0, autoArchiveInactiveDays: 0, sessionTimeoutDays: 30, updatedAt: '' },
      response: { ok: true },
    })
    renderPage()
    // Same race as above — wait for the loaded (enabled) state before
    // clicking, or a slow environment can click the still-disabled switch
    // and silently no-op.
    const toggle = await screen.findByRole('switch', { name: /public project access/i, checked: true })

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
      // Same settled-vs-loading race as the sibling "90d" test below —
      // "Off" also happens to be the pill's default/loading-state label,
      // so waitFor (not a synchronous assertion) is needed here too.
      await waitFor(() => expect(offPill).toHaveAttribute('aria-pressed', 'true'))
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
        data: { publicProjectsEnabled: true, runRetentionDays: 90, autoArchiveInactiveDays: 0, sessionTimeoutDays: 30, updatedAt: '' },
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
      expect(runRetentionGroup().queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    })

    it('entering and committing a custom value saves it without touching publicProjectsEnabled', async () => {
      mockAsTenantAdmin(true, true, 0)
      mockPATCH.mockResolvedValue({
        data: { publicProjectsEnabled: true, runRetentionDays: 10, autoArchiveInactiveDays: 0, sessionTimeoutDays: 30, updatedAt: '' },
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
      // Same settled-vs-loading race fixed above for Run retention's own
      // "Off" pill.
      await waitFor(() => expect(offPill).toHaveAttribute('aria-pressed', 'true'))
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
        data: { publicProjectsEnabled: true, runRetentionDays: 0, autoArchiveInactiveDays: 365, sessionTimeoutDays: 30, updatedAt: '' },
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

  describe('Appearance', () => {
    function appearanceSection() {
      return within(screen.getByRole('group', { name: 'Color theme' }))
    }

    it('groups the palette picker under an "Appearance" section label with a "Color theme" card', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      await screen.findByRole('switch', { name: /public project access/i })
      expect(screen.getByText('Appearance')).toBeInTheDocument()
      expect(screen.getByText('Color theme')).toBeInTheDocument()
    })

    it('renders four preset swatches: Teal, Indigo, Ocean, Forest', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      await screen.findByRole('group', { name: 'Color theme' })
      for (const name of ['Teal', 'Indigo', 'Ocean', 'Forest']) {
        expect(appearanceSection().getByRole('button', { name })).toBeInTheDocument()
      }
    })

    it('indicates the current selection', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'ocean')
      renderPage()
      await screen.findByRole('group', { name: 'Color theme' })
      expect(appearanceSection().getByRole('button', { name: 'Ocean' })).toHaveAttribute('aria-pressed', 'true')
      expect(appearanceSection().getByRole('button', { name: 'Teal' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('selecting a different preset saves immediately, with no separate Save step, and updates the indicated selection', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal')
      mockPATCH.mockResolvedValue({
        data: { publicProjectsEnabled: true, runRetentionDays: 0, autoArchiveInactiveDays: 0, colorTheme: 'indigo', sessionTimeoutDays: 30, updatedAt: '' },
        response: { ok: true },
      })
      renderPage()
      await screen.findByRole('group', { name: 'Color theme' })

      await userEvent.click(appearanceSection().getByRole('button', { name: 'Indigo' }))

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/instance-settings', {
          body: { colorTheme: 'indigo' },
        }),
      )
      expect(appearanceSection().getByRole('button', { name: 'Indigo' })).toHaveAttribute('aria-pressed', 'true')
    })

    // Regression guard: selecting a preset must re-theme the admin's own
    // page immediately (design.md: "applies instantly"), not just persist
    // server-side for the next full load. ThemeProvider reads colorTheme
    // from AuthProvider's context, not by fetching itself, so saving here
    // must trigger a fresh GET /api/v1/meta to update that context — found
    // via manual browser testing, where the swatch UI updated but
    // data-palette/--primary on <html> never changed until a reload.
    it('refetches /api/v1/meta after selecting a preset, so the instance palette context updates immediately', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal')
      mockPATCH.mockResolvedValue({
        data: { publicProjectsEnabled: true, runRetentionDays: 0, autoArchiveInactiveDays: 0, colorTheme: 'ocean', sessionTimeoutDays: 30, updatedAt: '' },
        response: { ok: true },
      })
      renderPage()
      await screen.findByRole('group', { name: 'Color theme' })
      const metaCallsBefore = mockGET.mock.calls.filter((c) => c[0] === '/api/v1/meta').length

      await userEvent.click(appearanceSection().getByRole('button', { name: 'Ocean' }))

      await waitFor(() => {
        const metaCallsAfter = mockGET.mock.calls.filter((c) => c[0] === '/api/v1/meta').length
        expect(metaCallsAfter).toBeGreaterThan(metaCallsBefore)
      })
    })

    it('renders a fifth "Custom" swatch, revealing the editor when selected', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal')
      renderPage()
      await screen.findByRole('group', { name: 'Color theme' })
      expect(screen.queryByRole('button', { name: 'Save custom palette' })).not.toBeInTheDocument()

      await userEvent.click(appearanceSection().getByRole('button', { name: 'Custom' }))

      expect(screen.getByRole('button', { name: 'Save custom palette' })).toBeInTheDocument()
    })

    // User-reported: clicking Custom should visually mark it as the active
    // selection immediately — the editor being open already communicates
    // "you're working in Custom," so the swatch itself shouldn't lag behind
    // and require an actual save (a server round-trip) before it agrees.
    it('marks Custom as selected as soon as it is opened, before any save, and un-marks the previous preset', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal')
      renderPage()
      await screen.findByRole('group', { name: 'Color theme' })
      expect(appearanceSection().getByRole('button', { name: 'Teal' })).toHaveAttribute('aria-pressed', 'true')

      await userEvent.click(appearanceSection().getByRole('button', { name: 'Custom' }))

      expect(appearanceSection().getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
      expect(appearanceSection().getByRole('button', { name: 'Teal' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('saving a custom palette calls PATCH with colorTheme "custom" and the edited values', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal')
      mockPATCH.mockResolvedValue({
        data: {
          publicProjectsEnabled: true, runRetentionDays: 0, autoArchiveInactiveDays: 0, colorTheme: 'custom', sessionTimeoutDays: 30, updatedAt: '',
        },
        response: { ok: true },
      })
      renderPage()
      await screen.findByRole('group', { name: 'Color theme' })
      await userEvent.click(appearanceSection().getByRole('button', { name: 'Custom' }))

      await userEvent.clear(screen.getByLabelText('Primary'))
      await userEvent.type(screen.getByLabelText('Primary'), '#123456')
      await userEvent.click(screen.getByRole('button', { name: 'Save custom palette' }))

      await waitFor(() => expect(mockPATCH).toHaveBeenCalled())
      const call = mockPATCH.mock.calls[0]
      expect(call[0]).toBe('/api/v1/instance-settings')
      const options = call[1] as { body: { colorTheme: string; customPalette: { light: { primary: string } } } }
      expect(options.body.colorTheme).toBe('custom')
      expect(options.body.customPalette.light.primary).toBe('#123456')
    })

    // Regression guard: reported directly by manual testing — server-side
    // state ended up genuinely corrupted (a nonsensical dark.background
    // value matching no known preset or prior save) after opening Custom,
    // switching to a preset, then reopening Custom. Root cause: selecting a
    // preset never hid the editor, so it stayed mounted with stale internal
    // draft state that a later Save could silently persist over the
    // server's real data.
    it('hides the custom editor when a preset is selected, and reopening Custom starts fresh from that preset', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal')
      mockPATCH.mockResolvedValue({
        data: { publicProjectsEnabled: true, runRetentionDays: 0, autoArchiveInactiveDays: 0, colorTheme: 'ocean', sessionTimeoutDays: 30, updatedAt: '' },
        response: { ok: true },
      })
      renderPage()
      await screen.findByRole('group', { name: 'Color theme' })

      await userEvent.click(appearanceSection().getByRole('button', { name: 'Custom' }))
      await userEvent.clear(screen.getByLabelText('Primary'))
      await userEvent.type(screen.getByLabelText('Primary'), '#123456')
      expect(screen.getByLabelText('Primary')).toHaveValue('#123456')

      await userEvent.click(appearanceSection().getByRole('button', { name: 'Ocean' }))
      expect(screen.queryByRole('button', { name: 'Save custom palette' })).not.toBeInTheDocument()

      await userEvent.click(appearanceSection().getByRole('button', { name: 'Custom' }))
      // Fresh mount seeded from Ocean (the now-active preset), not the
      // abandoned #123456 draft from before switching away.
      expect(screen.getByLabelText('Primary')).toHaveValue('#1453B8')
    })
  })

  describe('Default landing view (add-configurable-project-landing)', () => {
    it('shows five options with the current default selected', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal', '', 30, 'library')
      renderPage()
      const group = within(await screen.findByRole('group', { name: 'Default landing view' }))
      for (const label of ['Dashboard', 'Library', 'Suites', 'Runs', 'Reports']) {
        expect(group.getByRole('button', { name: label })).toBeInTheDocument()
      }
      expect(group.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-pressed', 'true')
      expect(group.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('selecting a view calls PATCH with defaultLandingView', async () => {
      mockAsTenantAdmin(true)
      mockPATCH.mockResolvedValue({
        data: { publicProjectsEnabled: true, runRetentionDays: 0, autoArchiveInactiveDays: 0, colorTheme: 'teal', sessionTimeoutDays: 30, defaultLandingView: 'reports', updatedAt: '' },
        response: { ok: true },
      })
      renderPage()
      const group = within(await screen.findByRole('group', { name: 'Default landing view' }))
      await userEvent.click(group.getByRole('button', { name: 'Reports' }))

      await waitFor(() => {
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/instance-settings', { body: { defaultLandingView: 'reports' } })
      })
      expect(group.getByRole('button', { name: 'Reports' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('Jira integration (add-jira-connector)', () => {
    it('shows the currently configured site URL', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal', 'https://mycompany.atlassian.net')
      renderPage()
      expect(await screen.findByLabelText(/jira site url/i)).toHaveValue('https://mycompany.atlassian.net')
    })

    it('saving a new site URL calls PATCH /api/v1/instance-settings', async () => {
      mockAsTenantAdmin(true)
      mockPATCH.mockResolvedValue({
        data: {
          publicProjectsEnabled: true,
          runRetentionDays: 0,
          autoArchiveInactiveDays: 0,
          colorTheme: 'teal',
          jiraSiteUrl: 'https://mycompany.atlassian.net',
          sessionTimeoutDays: 30,
          updatedAt: '',
        },
        response: { ok: true },
      })
      renderPage()
      const input = await screen.findByLabelText(/jira site url/i)
      await userEvent.type(input, 'https://mycompany.atlassian.net')
      await userEvent.click(within(input.closest('section') as HTMLElement).getByRole('button', { name: /save/i }))

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/instance-settings', {
          body: { jiraSiteUrl: 'https://mycompany.atlassian.net' },
        }),
      )
    })
  })

  describe('MCP integration (mcp-admin-discoverability-card)', () => {
    it('shows an MCP card describing the server and linking to token management', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      const title = await screen.findByText('MCP')
      const card = title.closest('[data-slot="card"]') as HTMLElement
      expect(within(card).getByText(/\/mcp/)).toBeInTheDocument()
      expect(within(card).getByText(/same api tokens/i)).toBeInTheDocument()
      const link = within(card).getByRole('link', { name: /manage tokens/i })
      expect(link).toHaveAttribute('href', '/settings/tokens')
    })

    it('shows no fabricated status indicator or connection count', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      const title = await screen.findByText('MCP')
      const card = title.closest('[data-slot="card"]') as HTMLElement
      expect(within(card).queryByText(/connected|online|offline/i)).not.toBeInTheDocument()
    })

    it('shows Enabled when TESTPULSE_MCP_ENABLED is on', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal', '', 30, 'dashboard', true)
      renderPage()
      const title = await screen.findByText('MCP')
      const card = title.closest('[data-slot="card"]') as HTMLElement
      expect(await within(card).findByText(/enabled/i)).toBeInTheDocument()
      expect(within(card).queryByText(/disabled/i)).not.toBeInTheDocument()
    })

    it('shows Disabled when TESTPULSE_MCP_ENABLED is off', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal', '', 30, 'dashboard', false)
      renderPage()
      const title = await screen.findByText('MCP')
      const card = title.closest('[data-slot="card"]') as HTMLElement
      expect(await within(card).findByText(/disabled/i)).toBeInTheDocument()
    })
  })

  describe('Session timeout (add-session-timeout-setting)', () => {
    it('shows the currently configured value', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal', '', 45)
      renderPage()
      const input = await screen.findByLabelText(/timeout/i)
      await waitFor(() => expect(input).toHaveValue(45))
    })

    it('is grouped under the Authentication section, above Single sign-on', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal', '', 30)
      renderPage()
      await screen.findByLabelText(/timeout/i)
      const authHeading = screen.getByText('Authentication')
      const section = authHeading.closest('section') as HTMLElement
      expect(within(section).getByText('Session timeout')).toBeInTheDocument()
      expect(within(section).getByText('Single sign-on')).toBeInTheDocument()
    })

    it('saving a valid new value calls PATCH /api/v1/instance-settings', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal', '', 30)
      mockPATCH.mockResolvedValue({
        data: {
          publicProjectsEnabled: true,
          runRetentionDays: 0,
          autoArchiveInactiveDays: 0,
          colorTheme: 'teal',
          sessionTimeoutDays: 14,
          updatedAt: '',
        },
        response: { ok: true },
      })
      renderPage()
      const input = await screen.findByLabelText(/timeout/i)
      await userEvent.clear(input)
      await userEvent.type(input, '14')
      await userEvent.click(within(input.closest('[data-slot="card"]') as HTMLElement).getByRole('button', { name: /save/i }))

      await waitFor(() =>
        expect(mockPATCH).toHaveBeenCalledWith('/api/v1/instance-settings', {
          body: { sessionTimeoutDays: 14 },
        }),
      )
    })

    it('shows a validation message and disables Save for a value below 1', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal', '', 30)
      renderPage()
      const input = await screen.findByLabelText(/timeout/i)
      await userEvent.clear(input)
      await userEvent.type(input, '0')

      expect(await screen.findByRole('alert')).toHaveTextContent(/between 1 and 90/i)
      expect(within(input.closest('[data-slot="card"]') as HTMLElement).getByRole('button', { name: /save/i })).toBeDisabled()
      expect(mockPATCH).not.toHaveBeenCalled()
    })

    it('shows a validation message and disables Save for a value above 90', async () => {
      mockAsTenantAdmin(true, true, 0, 0, 'teal', '', 30)
      renderPage()
      const input = await screen.findByLabelText(/timeout/i)
      await userEvent.clear(input)
      await userEvent.type(input, '91')

      expect(await screen.findByRole('alert')).toHaveTextContent(/between 1 and 90/i)
      expect(within(input.closest('[data-slot="card"]') as HTMLElement).getByRole('button', { name: /save/i })).toBeDisabled()
      expect(mockPATCH).not.toHaveBeenCalled()
    })
  })
})
