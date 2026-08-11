import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProjectPermissions, useProjectReadAccess } from './useProjectPermissions'
import { api } from '@/lib/api'
import type { AuthUser } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
})

const allTrue = {
  read: true,
  caseCreate: true,
  caseEdit: true,
  caseDelete: true,
  sectionCreate: true,
  sectionDelete: true,
  suiteCreate: true,
  suiteEditMembership: true,
  runCreate: true,
  runRecordResult: true,
  manageProject: true,
}

describe('useProjectPermissions', () => {
  it('fetches and returns the caller\'s effective permissions for the project', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}/permissions') {
        return Promise.resolve({ data: allTrue, response: { ok: true } })
      }
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })

    const { result } = renderHook(() => useProjectPermissions('p1'))
    await waitFor(() => expect(result.current).toEqual(allTrue))

    expect(mockGET).toHaveBeenCalledWith(
      '/api/v1/projects/{projectKey}/permissions',
      expect.objectContaining({ params: { path: { projectKey: 'p1' } } }),
    )
  })

  it('returns undefined (not a crash) before the request resolves or when projectKey is absent', () => {
    mockGET.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useProjectPermissions(undefined))
    expect(result.current).toBeUndefined()
    expect(mockGET).not.toHaveBeenCalled()
  })

  it('recovers gracefully when the request fails or is forbidden', async () => {
    mockGET.mockResolvedValue({ data: undefined, error: { error: 'forbidden' }, response: { ok: false } })
    const { result } = renderHook(() => useProjectPermissions('p1'))
    await waitFor(() => expect(mockGET).toHaveBeenCalled())
    expect(result.current).toBeUndefined()
  })

  it('does not update state after unmounting while a successful request is still in flight', async () => {
    let resolve!: (v: { data: typeof allTrue; response: { ok: true } }) => void
    mockGET.mockImplementation(() => new Promise((r) => (resolve = r)))
    const { unmount } = renderHook(() => useProjectPermissions('p1'))
    await waitFor(() => expect(mockGET).toHaveBeenCalled())
    unmount()
    expect(() => resolve({ data: allTrue, response: { ok: true } })).not.toThrow()
  })

  it('does not update state after unmounting while a failing request is still in flight', async () => {
    let reject!: (e: Error) => void
    mockGET.mockImplementation(() => new Promise((_r, j) => (reject = j)))
    const { unmount } = renderHook(() => useProjectPermissions('p1'))
    await waitFor(() => expect(mockGET).toHaveBeenCalled())
    unmount()
    reject(new Error('network down'))
    await Promise.resolve()
  })
})

const user: AuthUser = { id: 'u1', email: 'u1@example.com', isTenantAdmin: false }

describe('useProjectReadAccess (design.md D11)', () => {
  it('stays loading while authLoading is true, firing no request', () => {
    mockGET.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useProjectReadAccess('p1', user, true))
    expect(result.current).toBe('loading')
    expect(mockGET).not.toHaveBeenCalled()
  })

  it('stays loading while projectKey is absent', () => {
    mockGET.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useProjectReadAccess(undefined, user, false))
    expect(result.current).toBe('loading')
    expect(mockGET).not.toHaveBeenCalled()
  })

  it('resolves to public immediately for an anonymous visitor, firing no request', () => {
    mockGET.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useProjectReadAccess('p1', null, false))
    expect(result.current).toBe('public')
    expect(mockGET).not.toHaveBeenCalled()
  })

  it('resolves to member when the permissions fetch succeeds', async () => {
    mockGET.mockResolvedValue({ data: allTrue, response: { ok: true } })
    const { result } = renderHook(() => useProjectReadAccess('p1', user, false))
    await waitFor(() => expect(result.current).toBe('member'))
  })

  it('resolves to public — not stuck loading or denied — when the signed-in caller is not a project member (403)', async () => {
    mockGET.mockResolvedValue({ data: undefined, error: { error: 'forbidden' }, response: { ok: false } })
    const { result } = renderHook(() => useProjectReadAccess('p1', user, false))
    await waitFor(() => expect(result.current).toBe('public'))
  })

  it('resolves to public when the request errors outright', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useProjectReadAccess('p1', user, false))
    await waitFor(() => expect(result.current).toBe('public'))
  })
})
