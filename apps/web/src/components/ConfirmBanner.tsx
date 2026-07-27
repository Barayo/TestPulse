import { useEffect } from 'react'
import { Link } from 'react-router'

// A small, dependency-free stand-in for toast infrastructure the app
// doesn't have (rework-runs-list-ux design.md) — two call sites don't
// justify a library. Auto-dismisses so it doesn't linger indefinitely, but
// stays dismissable manually too.
const AUTO_DISMISS_MS = 4000

export function ConfirmBanner({
  message,
  linkTo,
  linkLabel,
  onDismiss,
}: {
  message: string
  linkTo?: string
  linkLabel?: string
  onDismiss: () => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm"
    >
      <span>{message}</span>
      {linkTo && linkLabel && (
        <Link to={linkTo} className="font-semibold text-primary underline">
          {linkLabel}
        </Link>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-auto text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  )
}
