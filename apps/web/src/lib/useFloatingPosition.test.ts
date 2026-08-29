import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { useFloatingPosition } from './useFloatingPosition'

function mockRect(overrides: Partial<DOMRect>): DOMRect {
  return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => '', ...overrides }
}

describe('useFloatingPosition', () => {
  it('returns null when closed', () => {
    const ref = createRef<HTMLDivElement>()
    const { result } = renderHook(() => useFloatingPosition(false, ref))
    expect(result.current).toBeNull()
  })

  it('returns null when there is no anchor element', () => {
    const ref = createRef<HTMLDivElement>()
    const { result } = renderHook(() => useFloatingPosition(true, ref))
    expect(result.current).toBeNull()
  })

  it('computes left-aligned position from the anchor rect', () => {
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(mockRect({ top: 100, left: 50, bottom: 120, right: 150 }))
    const ref = { current: el }

    const { result } = renderHook(() => useFloatingPosition(true, ref, 'left', 8))
    expect(result.current).toEqual({ top: 128, left: 50 })
  })

  it('computes right-aligned position anchored to the viewport right edge', () => {
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(mockRect({ top: 100, left: 50, bottom: 120, right: 150 }))
    const ref = { current: el }
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000)

    const { result } = renderHook(() => useFloatingPosition(true, ref, 'right', 8))
    expect(result.current).toEqual({ top: 128, right: 850 })
  })

  it('defaults the gap to 8 and aligns left', () => {
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(mockRect({ top: 0, left: 10, bottom: 20, right: 90 }))
    const ref = { current: el }

    const { result } = renderHook(() => useFloatingPosition(true, ref))
    expect(result.current).toEqual({ top: 28, left: 10 })
  })
})
