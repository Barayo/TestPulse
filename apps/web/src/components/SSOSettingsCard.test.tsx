import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SSOSettingsCard } from './SSOSettingsCard'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPATCH = vi.mocked(api.PATCH)
const mockPOST = vi.mocked(api.POST)
const mockDELETE = vi.mocked(api.DELETE)

const unconfiguredSettings = {
  publicProjectsEnabled: true,
  runRetentionDays: 0,
  autoArchiveInactiveDays: 0,
  colorTheme: 'teal' as const,
  updatedAt: '2026-01-01T00:00:00Z',
  oidcIssuer: '',
  oidcClientId: '',
  oidcClientSecretSet: false,
  oidcGroupClaim: '',
  oidcAdminClaimValues: [] as string[],
  oidcOnly: false,
  sessionTimeoutDays: 30,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/teams') return Promise.resolve({ data: [{ id: 't1', name: 'Platform', memberIds: [], createdAt: '' }], response: { ok: true } })
    if (path === '/api/v1/sso/team-mappings') return Promise.resolve({ data: [], response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
})

describe('SSOSettingsCard', () => {
  it('renders issuer/client ID/client secret/group claim/admin values fields', () => {
    render(<SSOSettingsCard settings={unconfiguredSettings} onSettingsChange={vi.fn()} />)
    expect(screen.getByLabelText(/issuer/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/client id/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/client secret/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/group claim/i)).toBeInTheDocument()
  })

  it('saves issuer/client ID/client secret and reports the change', async () => {
    mockPATCH.mockResolvedValue({
      data: { ...unconfiguredSettings, oidcIssuer: 'https://idp.example.com', oidcClientId: 'testpulse', oidcClientSecretSet: true },
      response: { ok: true },
    })
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SSOSettingsCard settings={unconfiguredSettings} onSettingsChange={onChange} />)

    await user.type(screen.getByLabelText(/issuer/i), 'https://idp.example.com')
    await user.type(screen.getByLabelText(/client id/i), 'testpulse')
    await user.type(screen.getByLabelText(/client secret/i), 'shh')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockPATCH).toHaveBeenCalledWith(
      '/api/v1/instance-settings',
      expect.objectContaining({
        body: expect.objectContaining({ oidcIssuer: 'https://idp.example.com', oidcClientId: 'testpulse', oidcClientSecret: 'shh' }),
      }),
    ))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
  })

  it('shows a validation error inline when the save is rejected', async () => {
    mockPATCH.mockResolvedValue({ data: undefined, error: { error: 'could not reach the OIDC issuer' }, response: { ok: false } })
    const user = userEvent.setup()
    render(<SSOSettingsCard settings={unconfiguredSettings} onSettingsChange={vi.fn()} />)

    await user.type(screen.getByLabelText(/issuer/i), 'https://bad.example.com')
    await user.type(screen.getByLabelText(/client id/i), 'testpulse')
    await user.type(screen.getByLabelText(/client secret/i), 'shh')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/could not reach the oidc issuer/i)).toBeInTheDocument()
  })

  it('never renders the actual client secret value when one is already set', () => {
    const configured = { ...unconfiguredSettings, oidcIssuer: 'https://idp.example.com', oidcClientId: 'testpulse', oidcClientSecretSet: true }
    render(<SSOSettingsCard settings={configured} onSettingsChange={vi.fn()} />)
    const secretInput = screen.getByLabelText(/client secret/i) as HTMLInputElement
    expect(secretInput.value).toBe('')
    expect(screen.getByText(/configured/i)).toBeInTheDocument()
  })

  it('disables the SSO-only toggle until SSO is fully configured', () => {
    render(<SSOSettingsCard settings={unconfiguredSettings} onSettingsChange={vi.fn()} />)
    expect(screen.getByRole('switch', { name: /sso-only/i })).toBeDisabled()
  })

  it('enables the SSO-only toggle once SSO is configured', () => {
    const configured = { ...unconfiguredSettings, oidcIssuer: 'https://idp.example.com', oidcClientId: 'testpulse', oidcClientSecretSet: true }
    render(<SSOSettingsCard settings={configured} onSettingsChange={vi.fn()} />)
    expect(screen.getByRole('switch', { name: /sso-only/i })).not.toBeDisabled()
  })

  it('disabling SSO clears settings after confirmation', async () => {
    const configured = { ...unconfiguredSettings, oidcIssuer: 'https://idp.example.com', oidcClientId: 'testpulse', oidcClientSecretSet: true }
    mockPATCH.mockResolvedValue({ data: unconfiguredSettings, response: { ok: true } })
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SSOSettingsCard settings={configured} onSettingsChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /disable sso/i }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(mockPATCH).toHaveBeenCalledWith(
      '/api/v1/instance-settings',
      expect.objectContaining({ body: { disableSso: true } }),
    ))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
  })

  it('lists existing claim→Team mappings', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/teams') return Promise.resolve({ data: [{ id: 't1', name: 'Platform', memberIds: [], createdAt: '' }], response: { ok: true } })
      if (path === '/api/v1/sso/team-mappings') return Promise.resolve({ data: [{ id: 'm1', claimValue: 'engineers', teamId: 't1' }], response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    render(<SSOSettingsCard settings={unconfiguredSettings} onSettingsChange={vi.fn()} />)
    expect(await screen.findByText('engineers')).toBeInTheDocument()
    expect(await screen.findByText('Platform')).toBeInTheDocument()
  })

  it('adds a claim→Team mapping', async () => {
    mockPOST.mockResolvedValue({ data: { id: 'm2', claimValue: 'sales', teamId: 't1' }, response: { ok: true } })
    const user = userEvent.setup()
    render(<SSOSettingsCard settings={unconfiguredSettings} onSettingsChange={vi.fn()} />)

    await screen.findByText('Platform')
    await user.type(screen.getByLabelText(/mapping claim value/i), 'sales')
    await user.selectOptions(screen.getByLabelText(/^team$/i), 't1')
    await user.click(screen.getByRole('button', { name: /add mapping/i }))

    await waitFor(() => expect(mockPOST).toHaveBeenCalledWith(
      '/api/v1/sso/team-mappings',
      expect.objectContaining({ body: { claimValue: 'sales', teamId: 't1' } }),
    ))
  })

  it('removes a claim→Team mapping', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/teams') return Promise.resolve({ data: [{ id: 't1', name: 'Platform', memberIds: [], createdAt: '' }], response: { ok: true } })
      if (path === '/api/v1/sso/team-mappings') return Promise.resolve({ data: [{ id: 'm1', claimValue: 'engineers', teamId: 't1' }], response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
    const user = userEvent.setup()
    render(<SSOSettingsCard settings={unconfiguredSettings} onSettingsChange={vi.fn()} />)

    await screen.findByText('engineers')
    await user.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(mockDELETE).toHaveBeenCalledWith('/api/v1/sso/team-mappings/{mappingId}', expect.objectContaining({ params: { path: { mappingId: 'm1' } } })))
  })
})
