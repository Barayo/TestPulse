import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSortOverride } from './useSortOverride'

const STORAGE_KEY = 'testpulse.projectListSort'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useSortOverride', () => {
  it('defaults to name ascending when nothing is stored', () => {
    const { result } = renderHook(() => useSortOverride())
    expect(result.current[0]).toEqual({ key: 'name', direction: 'asc' })
  })

  it('reads a previously stored value on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: 'suites', direction: 'desc' }))
    const { result } = renderHook(() => useSortOverride())
    expect(result.current[0]).toEqual({ key: 'suites', direction: 'desc' })
  })

  it('falls back to the default when stored JSON is invalid', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json')
    const { result } = renderHook(() => useSortOverride())
    expect(result.current[0]).toEqual({ key: 'name', direction: 'asc' })
  })

  it('writes through to localStorage when set, and re-applies on next mount', () => {
    const { result } = renderHook(() => useSortOverride())
    act(() => result.current[1]({ key: 'created', direction: 'desc' }))
    expect(result.current[0]).toEqual({ key: 'created', direction: 'desc' })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ key: 'created', direction: 'desc' }))

    const { result: secondMount } = renderHook(() => useSortOverride())
    expect(secondMount.current[0]).toEqual({ key: 'created', direction: 'desc' })
  })
})
