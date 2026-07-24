import { forwardRef, Fragment, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontalIcon } from 'lucide-react'

export type RowActionMenuItem = {
  label: string
  onSelect: () => void
  icon?: ReactNode
  danger?: boolean
  dividerBefore?: boolean
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
export const RowActionMenu = forwardRef<RowActionMenuHandle, { label: string; items: RowActionMenuItem[] }>(
  function RowActionMenu({ label, items }, ref) {
    const [open, setOpen] = useState(false)
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    function close() {
      setOpen(false)
      setCursorPos(null)
    }

    useImperativeHandle(ref, () => ({
      openAt: (x, y) => {
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

    const menu = (
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        className={
          cursorPos
            ? 'fixed z-50 w-40 rounded-md border bg-card py-1 text-sm shadow-lg'
            : 'absolute right-0 z-50 mt-1 w-40 rounded-md border bg-card py-1 text-sm shadow-lg'
        }
        style={cursorPos ? { left: cursorPos.x, top: cursorPos.y } : undefined}
      >
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.dividerBefore && <span role="separator" className="my-1 block border-t" />}
            <button
              type="button"
              role="menuitem"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent ${
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
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => {
            setCursorPos(null)
            setOpen((o) => !o)
          }}
        >
          <MoreHorizontalIcon className="size-4" aria-hidden="true" />
        </button>

        {/* A cursor-positioned (right-click) menu is portaled to <body> —
            nested deep inside the Library's layout, a plain `fixed` div can
            end up visually covered by unrelated ancestors despite z-50
            (found via a real-browser click-interception failure that jsdom
            couldn't catch). The button-anchored case is unaffected: it's
            already proven correct in production and stays un-portaled. */}
        {open && (cursorPos ? createPortal(menu, document.body) : menu)}
      </div>
    )
  },
)
