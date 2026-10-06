import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

export interface ResizeHandleProps {
  width: number
  min: number
  max: number
  onResize: (width: number) => void
  onKeyDown: (e: KeyboardEvent) => void
  label?: string
}

// Invisible at rest — the panel's own border-r is the only affordance until
// hover/focus/drag, then a solid --primary line takes over (Pepe design
// review, add-resizable-library-tree): this palette's --border measures
// sub-pixel at typical DPR (docs/design-system.md), so a soft tint has no
// area to lean on at 2px width the way FolderTree's bg-primary/10 drag-over
// state does across a whole row.
export function ResizeHandle({ width, min, max, onResize, onKeyDown, label }: ResizeHandleProps) {
  const { t } = useTranslation()
  const resolvedLabel = label ?? t('ResizeHandle.defaultLabel')
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; width: number } | null>(null)

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      dragStart.current = { x: e.clientX, width }
      setIsDragging(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      function onPointerMove(moveEvent: PointerEvent) {
        if (!dragStart.current) return
        onResize(dragStart.current.width + (moveEvent.clientX - dragStart.current.x))
      }

      function stopDragging() {
        dragStart.current = null
        setIsDragging(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', stopDragging)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', stopDragging)
    },
    [width, onResize],
  )

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={resolvedLabel}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={onKeyDown}
      className="group relative w-2 shrink-0 cursor-col-resize self-stretch outline-none"
    >
      <span
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-primary transition-opacity group-focus-visible:ring-3 group-focus-visible:ring-ring/50 ${
          isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
        }`}
      />
    </div>
  )
}
