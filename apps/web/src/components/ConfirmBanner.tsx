import { XIcon } from 'lucide-react'
import { Link } from 'react-router'

// A small, dependency-free stand-in for toast infrastructure the app
// doesn't have (rework-runs-list-ux design.md) — two call sites don't
// justify a library. Fixed/viewport-anchored so it's visible regardless of
// scroll position when it fires (rework-suite-run-flow design.md D1) —
// dismissed only by the user or by the host page unmounting on navigation.
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
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 flex items-start gap-2.5 rounded-xl bg-card px-4 py-3.5 text-sm shadow-lg ring-1 ring-foreground/10 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
    >
      <span className="flex-1 leading-snug">
        {message}
        {linkTo && linkLabel && (
          <>
            {' '}
            <Link to={linkTo} className="font-semibold text-primary underline">
              {linkLabel}
            </Link>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
