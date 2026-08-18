import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResizableWidth } from './useResizableWidth'

const STORAGE_KEY = 'testpulse.libraryTreeWidth'
const OPTIONS = { storageKey: STORAGE_KEY, defaultWidth: 256, min: 200, max: 480 }

function keyEvent(key: string) {
  return { key, preventDefault: () => {} } as React.KeyboardEvent
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('useResizableWidth', () => {
  it('starts at the default width when nothing is stored', () => {
    const { result } = renderHook(() => useResizableWidth(OPTIONS))
    expect(result.current.width).toBe(256)
  })

  it('reads a previously stored value on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, '320')
    const { result } = renderHook(() => useResizableWidth(OPTIONS))
    expect(result.current.width).toBe(320)
  })

  it('clamps an out-of-range stored value on read', () => {
    window.localStorage.setItem(STORAGE_KEY, '999')
    const { result } = renderHook(() => useResizableWidth(OPTIONS))
    expect(result.current.width).toBe(480)
  })

  it('writes through to localStorage when setWidth is called, and re-applies on next mount', () => {
    const { result } = renderHook(() => useResizableWidth(OPTIONS))
    act(() => result.current.setWidth(300))
    expect(result.current.width).toBe(300)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('300')

    const { result: secondMount } = renderHook(() => useResizableWidth(OPTIONS))
    expect(secondMount.current.width).toBe(300)
  })

  it('clamps setWidth calls to the min/max range', () => {
    const { result } = renderHook(() => useResizableWidth(OPTIONS))
    act(() => result.current.setWidth(50))
    expect(result.current.width).toBe(200)
    act(() => result.current.setWidth(9000))
    expect(result.current.width).toBe(480)
  })

  it('moves the width by 16px on ArrowRight and ArrowLeft, clamped to min/max', () => {
    const { result } = renderHook(() => useResizableWidth(OPTIONS))
    act(() => result.current.onKeyDown(keyEvent('ArrowRight')))
    expect(result.current.width).toBe(272)
    act(() => result.current.onKeyDown(keyEvent('ArrowLeft')))
    act(() => result.current.onKeyDown(keyEvent('ArrowLeft')))
    expect(result.current.width).toBe(240)
  })

  it('jumps to the minimum or maximum on Home/End', () => {
    const { result } = renderHook(() => useResizableWidth(OPTIONS))
    act(() => result.current.onKeyDown(keyEvent('End')))
    expect(result.current.width).toBe(480)
    act(() => result.current.onKeyDown(keyEvent('Home')))
    expect(result.current.width).toBe(200)
  })
})
