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
