import { useCallback, useState, type KeyboardEvent } from 'react'

const KEYBOARD_STEP = 16

function clamp(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width))
}

export interface UseResizableWidthOptions {
  storageKey: string
  defaultWidth: number
  min: number
  max: number
}

export interface ResizableWidthState {
  width: number
  setWidth: (width: number) => void
  onKeyDown: (e: KeyboardEvent) => void
}

// localStorage, not a cookie (design D1, matches useViewModeOverride.ts) — a
// pure client-rendered SPA, so no server ever reads this preference.
export function useResizableWidth({ storageKey, defaultWidth, min, max }: UseResizableWidthOptions): ResizableWidthState {
  const [width, setWidthState] = useState<number>(() => {
    const stored = window.localStorage.getItem(storageKey)
    const parsed = stored === null ? NaN : Number(stored)
    return clamp(Number.isNaN(parsed) ? defaultWidth : parsed, min, max)
  })

  const setWidth = useCallback(
    (next: number) => {
      const clamped = clamp(next, min, max)
      window.localStorage.setItem(storageKey, String(clamped))
      setWidthState(clamped)
    },
    [storageKey, min, max],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setWidth(width + KEYBOARD_STEP)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setWidth(width - KEYBOARD_STEP)
      } else if (e.key === 'Home') {
        e.preventDefault()
        setWidth(min)
      } else if (e.key === 'End') {
        e.preventDefault()
        setWidth(max)
      }
    },
    [width, setWidth, min, max],
  )

  return { width, setWidth, onKeyDown }
}
