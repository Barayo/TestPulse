import { useLayoutEffect, useState, type RefObject } from 'react'

export type FloatingPosition = { top: number; left?: number; right?: number }

// Popovers anchored inside a scroll/overflow-clipped ancestor (a card with
// overflow-hidden for its accent border, a filter row with overflow-x-auto
// for narrow viewports) get silently clipped by that ancestor's box, no
// matter how high their z-index — position:absolute is still constrained by
// the nearest clipping ancestor. Portaling the dropdown to document.body and
// positioning it with viewport-relative fixed coordinates sidesteps that
// entirely (add-project-tags: caught by manual click-through, not by tests).
export function useFloatingPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  align: 'left' | 'right' = 'left',
  gap = 8,
): FloatingPosition | null {
  const [position, setPosition] = useState<FloatingPosition | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPosition(null)
      return
    }
    const rect = anchorRef.current.getBoundingClientRect()
    setPosition(
      align === 'right'
        ? { top: rect.bottom + gap, right: window.innerWidth - rect.right }
        : { top: rect.bottom + gap, left: rect.left },
    )
  }, [open, anchorRef, align, gap])

  return position
}
