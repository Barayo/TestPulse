import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from './useIsMobile'

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = []
  const mql = {
    matches,
    media: '(max-width: 640px)',
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  }
  window.matchMedia = vi.fn().mockReturnValue(mql)
  return {
    fireChange(next: boolean) {
      mql.matches = next
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent))
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useIsMobile', () => {
  it('reflects the current match state (mobile)', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('reflects the current match state (desktop)', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('updates when the viewport crosses the breakpoint', () => {
    const { fireChange } = mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => fireChange(true))
    expect(result.current).toBe(true)
  })
})
