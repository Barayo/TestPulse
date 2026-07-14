import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewModeOverride } from './useViewModeOverride'

const STORAGE_KEY = 'testpulse.projectListViewMode'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useViewModeOverride', () => {
  it('starts as null (no override) when nothing is stored', () => {
    const { result } = renderHook(() => useViewModeOverride())
    expect(result.current[0]).toBeNull()
  })

  it('reads a previously stored value on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, 'compact')
    const { result } = renderHook(() => useViewModeOverride())
    expect(result.current[0]).toBe('compact')
  })

  it('writes through to localStorage when set, and re-applies on next mount', () => {
    const { result } = renderHook(() => useViewModeOverride())
    act(() => result.current[1]('expanded'))
    expect(result.current[0]).toBe('expanded')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('expanded')

    const { result: secondMount } = renderHook(() => useViewModeOverride())
    expect(secondMount.current[0]).toBe('expanded')
  })
})
