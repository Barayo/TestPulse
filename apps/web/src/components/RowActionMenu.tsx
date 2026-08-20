import { forwardRef, Fragment, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontalIcon } from 'lucide-react'

export type RowActionMenuItem = {
  label: string
  onSelect: () => void
  icon?: ReactNode
  danger?: boolean
  dividerBefore?: boolean
  disabled?: boolean
}

export type RowActionMenuHandle = {
  // Opens the menu fixed at an explicit viewport position — the
  // right-click/contextmenu entry point, alongside the visible trigger
  // button (unify-library-row-menus).
  openAt: (x: number, y: number) => void
}

// Closed-by-default per-row "⋯" menu — the click-outside/Escape-to-close
// logic mirrors AdminMenu.tsx exactly, applied to a row context instead of
// top-level nav (redesign-delete-mode-menu). Also openable via right-click
// at the cursor through the imperative handle (unify-library-row-menus) —
// one state machine and one set of items, two entry points.
export const RowActionMenu = forwardRef<
  RowActionMenuHandle,
  { label: string; items: RowActionMenuItem[]; trigger?: ReactNode }
>(function RowActionMenu({ label, items, trigger }, ref) {
    const [open, setOpen] = useState(false)
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
    const [anchorPos, setAnchorPos] = useState<{ top: number; right: number } | null>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    function close() {
      setOpen(false)
      setCursorPos(null)
      setAnchorPos(null)
    }

    useImperativeHandle(ref, () => ({
      openAt: (x, y) => {
        setAnchorPos(null)
        setCursorPos({ x, y })
        setOpen(true)
      },
    }))

    useEffect(() => {
      if (!open) return
      function onPointerDown(e: PointerEvent) {
        const target = e.target as Node
        if (wrapRef.current?.contains(target)) return
        if (menuRef.current?.contains(target)) return
        close()
      }
      function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') close()
      }
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
      return () => {
        document.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('keydown', onKeyDown)
      }
    }, [open])

    const menuStyle = cursorPos
      ? { left: cursorPos.x, top: cursorPos.y }
      : anchorPos
        ? { top: anchorPos.top, right: anchorPos.right }
        : undefined

    const menu = (
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        className="fixed z-50 w-40 rounded-md border bg-card py-1 text-sm shadow-lg"
        style={menuStyle}
      >
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.dividerBefore && <span role="separator" className="my-1 block border-t" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-40 ${
                item.danger ? 'text-destructive' : ''
              }`}
              onClick={() => {
                close()
                item.onSelect()
              }}
            >
              {item.icon}
              {item.label}
            </button>
          </Fragment>
        ))}
      </div>
    )

    return (
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          className={
            trigger
              ? 'flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent'
              : 'flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground'
          }
          onClick={() => {
            setCursorPos(null)
            const rect = wrapRef.current?.getBoundingClientRect()
            setAnchorPos(rect ? { top: rect.bottom + 4, right: window.innerWidth - rect.right } : null)
            setOpen((o) => !o)
          }}
        >
          {trigger ?? <MoreHorizontalIcon className="size-4" aria-hidden="true" />}
        </button>

        {/* Always portaled to <body> and `fixed`-positioned from the
            trigger's own bounding rect, computed at open time — a plain
            `absolute` menu nested inside a row gets clipped the instant that
            row sits near the bottom of an `overflow-hidden` ancestor (every
            `Card`, see ui/card.tsx), which is routine for a short list like
            a suite's "Run history". Found live: "Compare…" on a lone run row
            rendered as an empty, unclickable box. Matches the reasoning
            already applied to the cursor-positioned (right-click) case. */}
        {open && createPortal(menu, document.body)}
      </div>
    )
  },
)
