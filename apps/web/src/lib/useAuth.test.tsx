import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './useAuth'
import { api } from '@/lib/api'
import { notifySessionExpired } from '@/lib/sessionExpiry'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

beforeEach(() => {
  vi.resetAllMocks()
})

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('useAuth', () => {
  it('starts loading, then resolves the current user from /users/me', async () => {
    mockGET.mockResolvedValue({
      data: { id: 'u1', email: 'admin@example.com', isTenantAdmin: true },
      response: { ok: true },
    })
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toEqual({ id: 'u1', email: 'admin@example.com', isTenantAdmin: true })
  })

  it('resolves no user when the session check fails', async () => {
    mockGET.mockResolvedValue({ data: undefined, response: { ok: false } })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('resolves no user, without hanging, when the session check errors', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('login sets the user on success', async () => {
    mockGET.mockResolvedValue({ data: undefined, response: { ok: false } })
    mockPOST.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let outcome: { ok: boolean } | undefined
    await act(async () => {
      outcome = await result.current.login('a@b.com', 'correcthorse')
    })
    expect(outcome).toEqual({ ok: true, user: { id: 'u1', email: 'a@b.com', isTenantAdmin: false } })
    expect(result.current.user).toEqual({ id: 'u1', email: 'a@b.com', isTenantAdmin: false })
  })

  it('login returns an error and does not set a user on failure', async () => {
    mockGET.mockResolvedValue({ data: undefined, response: { ok: false } })
    mockPOST.mockResolvedValue({ data: undefined, response: { ok: false } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let outcome: { ok: boolean; error?: string } | undefined
    await act(async () => {
      outcome = await result.current.login('a@b.com', 'wrong')
    })
    expect(outcome?.ok).toBe(false)
    expect(outcome?.error).toBeTruthy()
    expect(result.current.user).toBeNull()
  })

  it('logout clears the user', async () => {
    mockGET.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    mockPOST.mockResolvedValue({ data: undefined, response: { ok: true } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await act(async () => {
      await result.current.logout()
    })
    expect(result.current.user).toBeNull()
  })

  it('sets sessionExpired when notified while a user is authenticated', async () => {
    mockGET.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())
    expect(result.current.sessionExpired).toBe(false)

    act(() => notifySessionExpired())

    expect(result.current.sessionExpired).toBe(true)
    // The user is never cleared when expiry is detected — RequireAuth's own
    // redirect must not race the session-expiry modal (handle-session-expiry).
    expect(result.current.user).not.toBeNull()
  })

  it('ignores a session-expiry notification when there was never a user (first load)', async () => {
    mockGET.mockResolvedValue({ data: undefined, response: { ok: false } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => notifySessionExpired())

    expect(result.current.sessionExpired).toBe(false)
  })

  it('refreshUser re-fetches /users/me and updates the context (add-user-profile)', async () => {
    mockGET.mockResolvedValueOnce({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    mockGET.mockResolvedValueOnce({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false, displayName: 'Ada', avatarKey: 'ada-lovelace' },
      response: { ok: true },
    })
    await act(async () => {
      await result.current.refreshUser()
    })

    expect(result.current.user?.displayName).toBe('Ada')
    expect(result.current.user?.avatarKey).toBe('ada-lovelace')
  })

  it('resolves setupRequired from /api/v1/meta (add-first-run-setup)', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { setupRequired: true }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.setupRequired).toBe(true))
  })

  it('defaults setupRequired to false once any user exists', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { setupRequired: false }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.setupRequired).toBe(false)
  })

  // Regression guard: a hung /api/v1/meta must never block `loading` from
  // resolving — a stuck setupRequired check must not stop the rest of the
  // app (readiness display, every other route) from rendering.
  it('does not block loading on a /api/v1/meta request that never resolves', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') return new Promise(() => {})
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.setupRequired).toBe(false)
  })

  it('defaults setupRequired to false when the meta check errors', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') return Promise.reject(new Error('network down'))
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.setupRequired).toBe(false))
  })

  it('resolves colorTheme from /api/v1/meta, defaulting to teal (add-color-theme-customization)', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { setupRequired: false, colorTheme: 'teal' }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.setupRequiredLoading).toBe(false))
    expect(result.current.colorTheme).toBe('teal')
    expect(result.current.customPalette).toBeNull()
  })

  it('resolves customPalette from /api/v1/meta when colorTheme is custom', async () => {
    const customPalette = {
      light: {
        background: '#F8F7FA', foreground: '#160B2E', card: '#FFFFFF', primary: '#4514B8',
        primaryForeground: '#FFFFFF', muted: '#EFEDF5', mutedForeground: '#605B6B',
        accent: '#EFEDF5', border: '#E0DCEC', input: '#E0DCEC',
      },
      dark: {
        background: '#140B2A', foreground: '#EAE6F5', card: '#1D1440', primary: '#5F2DD4',
        primaryForeground: '#EAE6F5', muted: '#241A4D', mutedForeground: '#9D8FBD',
        accent: '#241A4D', border: '#2E2358', input: '#2E2358',
      },
    }
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { setupRequired: false, colorTheme: 'custom', customPalette }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.colorTheme).toBe('custom'))
    expect(result.current.customPalette).toEqual(customPalette)
  })

  it('refreshColorTheme re-fetches /api/v1/meta and updates colorTheme/customPalette in context (add-color-theme-customization)', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { setupRequired: false, colorTheme: 'teal' }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.colorTheme).toBe('teal'))

    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { setupRequired: false, colorTheme: 'ocean' }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    await act(async () => {
      await result.current.refreshColorTheme()
    })

    expect(result.current.colorTheme).toBe('ocean')
  })

  it('resolves jiraSiteUrl from /api/v1/meta, defaulting to empty (add-jira-connector)', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { setupRequired: false, colorTheme: 'teal' }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.setupRequiredLoading).toBe(false))
    expect(result.current.jiraSiteUrl).toBe('')
  })

  // The public-landing redirect (ProjectsPage) trusts a `false` value here
  // to skip rendering entirely, the same class of decision setupRequired's
  // own redirect makes — so it defaults to `true` (the safe, "don't
  // wrongly redirect away from a legitimate discovery visit" default,
  // mirroring setupRequired's own "already-configured instance is the
  // ordinary case" reasoning) and callers must wait for
  // setupRequiredLoading before trusting a `false` value.
  it('resolves publicProjectsEnabled from /api/v1/meta, defaulting to true', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({ data: { setupRequired: false, colorTheme: 'teal' }, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.setupRequiredLoading).toBe(false))
    expect(result.current.publicProjectsEnabled).toBe(true)
  })

  it('resolves publicProjectsEnabled: false from /api/v1/meta when the instance-wide switch is off', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({
          data: { setupRequired: false, colorTheme: 'teal', publicProjectsEnabled: false },
          response: { ok: true },
        })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.setupRequiredLoading).toBe(false))
    expect(result.current.publicProjectsEnabled).toBe(false)
  })

  it('resolves a configured jiraSiteUrl from /api/v1/meta (add-jira-connector)', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/meta') {
        return Promise.resolve({
          data: { setupRequired: false, colorTheme: 'teal', jiraSiteUrl: 'https://mycompany.atlassian.net' },
          response: { ok: true },
        })
      }
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.jiraSiteUrl).toBe('https://mycompany.atlassian.net'))
  })

  it('throws when used outside an AuthProvider', () => {
    function Bad() {
      useAuth()
      return null
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow(/AuthProvider/)
    consoleError.mockRestore()
  })
})
