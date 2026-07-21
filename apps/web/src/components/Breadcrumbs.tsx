import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export type Crumb = { label: string; href?: string }

// Beyond this many segments, the middle collapses behind a "…" menu — an
// unbounded chain of shrink-0 segments (deep folder nesting) would otherwise
// force the whole row to scroll horizontally, hiding the current page (the
// one thing a breadcrumb exists to show) off-screen. 5 covers the common
// real case (Projects › Project › Library › one folder › current) unchanged.
const MAX_VISIBLE_SEGMENTS = 5

function Separator() {
  return <span aria-hidden="true">›</span>
}

function HiddenSegmentsMenu({ segments }: { segments: Crumb[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span ref={ref} className="relative flex shrink-0 items-center gap-2">
      <Separator />
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Show ${segments.length} hidden path segments`}
        className="hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        …
      </button>
      {open && (
        <span
          role="menu"
          aria-label="Hidden path segments"
          className="absolute top-full left-0 z-50 mt-1 max-h-64 min-w-40 overflow-y-auto rounded-md border bg-card py-1 text-sm normal-case shadow-lg"
        >
          {segments.map((s, i) => (
            <Link
              key={i}
              role="menuitem"
              to={s.href ?? '#'}
              className="block px-3 py-1.5 hover:bg-accent"
              onClick={() => setOpen(false)}
            >
              {s.label}
            </Link>
          ))}
        </span>
      )}
    </span>
  )
}

// A single segment can't navigate anywhere — it would just repeat the page's
// own heading directly below it (e.g. "PROJECTS" over an "H1: Projects").
// Only render once there's an actual trail to show.
export function Breadcrumbs({ segments }: { segments: Crumb[] }) {
  if (segments.length <= 1) return null

  if (segments.length <= MAX_VISIBLE_SEGMENTS) {
    return (
      <nav aria-label="Breadcrumb" className="tp-label flex flex-nowrap items-center gap-2 overflow-x-auto">
        {segments.map((segment, i) => {
          const isLast = i === segments.length - 1
          return (
            <span
              key={i}
              className={isLast ? 'flex min-w-16 flex-1 items-center gap-2' : 'flex shrink-0 items-center gap-2'}
            >
              {i > 0 && <Separator />}
              {!isLast && segment.href ? (
                <Link to={segment.href} className="shrink-0 hover:text-foreground">
                  {segment.label}
                </Link>
              ) : (
                <span className={isLast ? 'min-w-16 truncate text-foreground' : undefined}>{segment.label}</span>
              )}
            </span>
          )
        })}
      </nav>
    )
  }

  // Deep chain: keep the entry point + project (orientation) and the
  // immediate parent + current page (location) always visible; collapse
  // everything else behind a menu. Every visible non-last segment is also
  // width-capped here — unlike the short case above, we can no longer
  // assume "earlier segments are short structural labels."
  const [first, second] = segments
  const hidden = segments.slice(2, -2)
  const [parent, current] = segments.slice(-2)

  return (
    <nav aria-label="Breadcrumb" className="tp-label flex flex-nowrap items-center gap-2 overflow-x-auto">
      <span className="flex shrink-0 items-center gap-2">
        {first.href ? (
          <Link to={first.href} className="max-w-32 truncate hover:text-foreground">
            {first.label}
          </Link>
        ) : (
          <span className="max-w-32 truncate">{first.label}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Separator />
        {second.href ? (
          <Link to={second.href} className="max-w-32 truncate hover:text-foreground">
            {second.label}
          </Link>
        ) : (
          <span className="max-w-32 truncate">{second.label}</span>
        )}
      </span>
      <HiddenSegmentsMenu segments={hidden} />
      <span className="flex shrink-0 items-center gap-2">
        <Separator />
        {parent.href ? (
          <Link to={parent.href} className="max-w-32 truncate hover:text-foreground">
            {parent.label}
          </Link>
        ) : (
          <span className="max-w-32 truncate">{parent.label}</span>
        )}
      </span>
      <span className="flex min-w-16 flex-1 items-center gap-2">
        <Separator />
        <span className="min-w-16 truncate text-foreground">{current.label}</span>
      </span>
    </nav>
  )
}
