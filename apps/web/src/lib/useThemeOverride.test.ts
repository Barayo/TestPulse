import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useThemeOverride } from './useThemeOverride'

const STORAGE_KEY = 'testpulse.themeOverride'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useThemeOverride', () => {
  it('starts as null (System) when nothing is stored', () => {
    const { result } = renderHook(() => useThemeOverride())
    expect(result.current[0]).toBeNull()
  })

  it('reads a previously stored value on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useThemeOverride())
    expect(result.current[0]).toBe('dark')
  })

  it('writes through to localStorage when set, and re-applies on next mount', () => {
    const { result } = renderHook(() => useThemeOverride())
    act(() => result.current[1]('light'))
    expect(result.current[0]).toBe('light')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light')

    const { result: secondMount } = renderHook(() => useThemeOverride())
    expect(secondMount.current[0]).toBe('light')
  })

  it('clears back to null (System) and removes the stored key', () => {
    const { result } = renderHook(() => useThemeOverride())
    act(() => result.current[1]('dark'))
    expect(result.current[0]).toBe('dark')

    act(() => result.current[1](null))
    expect(result.current[0]).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
