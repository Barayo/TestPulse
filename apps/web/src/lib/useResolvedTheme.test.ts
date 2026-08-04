import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResolvedTheme } from './useResolvedTheme'

const STORAGE_KEY = 'testpulse.themeOverride'

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  let changeHandler: ((e: { matches: boolean }) => void) | null = null
  const mql = {
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((event: string, handler: (e: { matches: boolean }) => void) => {
      if (event === 'change') changeHandler = handler
    }),
    removeEventListener: vi.fn(),
  }
  window.matchMedia = vi.fn().mockReturnValue(mql)
  return {
    fireChange(newMatches: boolean) {
      matches = newMatches
      act(() => changeHandler?.({ matches: newMatches }))
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('useResolvedTheme', () => {
  it('resolves to dark when the OS prefers dark and there is no override', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current[0]).toBe('dark')
  })

  it('resolves to light when the OS prefers light and there is no override', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current[0]).toBe('light')
  })

  it('follows a live OS preference change when there is no override', () => {
    const media = mockMatchMedia(false)
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current[0]).toBe('light')

    media.fireChange(true)
    expect(result.current[0]).toBe('dark')
  })

  it('ignores an OS preference change once an explicit override is set', () => {
    const media = mockMatchMedia(false)
    const { result } = renderHook(() => useResolvedTheme())
    act(() => result.current[1]('light'))

    media.fireChange(true)
    expect(result.current[0]).toBe('light')
  })

  it('an explicit override takes effect immediately', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useResolvedTheme())
    act(() => result.current[1]('dark'))
    expect(result.current[0]).toBe('dark')
  })

  it('exposes the raw override (null for System) alongside the resolved theme', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark')
    mockMatchMedia(false)
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current[2]).toBe('dark')
  })
})
