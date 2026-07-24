## Context

`useAuth.tsx`'s session check runs exactly once, on `AuthProvider` mount — it asks
`GET /api/v1/users/me`, sets `user`, and never checks again. `RequireAuth` (`App.tsx`) redirects
to `/login` only when `loading` has resolved and `user` is still `null` — i.e., only on first
load. Once a user is authenticated, nothing in the frontend is listening for the session going
bad later (cookie expiry, server-side revocation): a `401` on any later request is just an
`{ data: undefined, error, response: { ok: false } }` from `openapi-fetch` that individual pages
either don't check or handle as an empty state. This was reported directly by the user and
diagnosed/designed collaboratively before implementation (see conversation).

## Goals / Non-Goals

**Goals:**
- Any `401` on an authenticated request prompts re-login without losing the user's place.
- Never silently drop a first-load `401` and a mid-use `401` into the same code path — they need
  different responses (redirect vs. overlay).
- Never resume a view with data that might belong to a different identity or privilege level.

**Non-Goals:**
- Silent token refresh / extending the session without user action — sessions are already
  sliding-expiry per `authentication`'s spec; this change is only about what the UI does once a
  session has actually gone invalid.
- Any backend change — the session/cookie model is unchanged; this is purely a frontend reaction
  to the `401` the backend already produces correctly.

## Decisions

**A tiny pub/sub bridge (`sessionExpiry.ts`), not a global store library.** `api.ts` is a plain
module with no React context access; `AuthProvider` is the only thing that should decide what a
`401` means. A minimal `Set<() => void>` of listeners plus `notifySessionExpired()` /
`onSessionExpired()` is the smallest thing that connects the two without pulling in a state
library for one boolean.

**Gate on `user !== null` at the moment the `401` arrives, not on request path alone.** The
interceptor excludes both `/api/v1/auth/login` (a wrong-password attempt, including one made
*inside* the new modal, must never re-trigger itself) and `/api/v1/auth/logout` (if a session is
already silently dead when the user explicitly clicks "Log out," that request's own `401` must
not pop the re-login modal instead of the expected clean landing on `/login` — `logout()` only
calls `setUser(null)` *after* the request resolves, so without this exclusion `user` would still
read non-null at the moment the interceptor fires). But the real disambiguator between "first
load, never logged in" and "mid-use expiry" is whether `AuthProvider` currently believes there's
a user — `RequireAuth`'s existing redirect already owns the first case correctly; this change
must not double-fire on top of it.

**Invariant: `user` is never cleared or nulled when a mid-use `401` is detected.** Setting
`sessionExpired = true` must be the *only* effect — `user` keeps its previous value until either
(a) `LoginForm`'s successful re-auth updates it (moot, since a hard navigation follows
immediately and discards all state anyway) or (b) it's never touched again because the tab
navigates away. This is load-bearing, not incidental: `RequireAuth`'s `if (!user) return
<Navigate to="/login"/>` fires on `user` being falsy — clearing `user` at expiry time would make
that redirect fire in the same render pass as the new modal, racing two different responses to
the same event.

**Non-dismissable modal, not a route change.** Deliberately chosen over redirecting to `/login`
(the first-load pattern): a mid-use expiry means the user was already looking at something, and
losing that view (scroll position, an open dialog, in-progress form state) is worse than a
same-user first-load redirect where nothing was in progress yet. `DialogContent`'s existing
`showCloseButton` prop is set `false`, and `onEscapeKeyDown`/`onPointerDownOutside` are
intercepted with `preventDefault()` (Radix's supported mechanism for a non-dismissable dialog) —
re-authenticating is the only way out.

**Pre-filled but editable email; compare identity after re-auth, not before.** Locking the email
field to "only the same person may re-enter" was considered and rejected — a shared machine or a
second person picking up the session is a real case, and blocking it would just force a full
page reload to get to a normal `/login` anyway, achieving nothing extra. Instead: pre-fill for
the common case (convenience), allow editing, and branch on the *result*:
- Same user id as before → `window.location.reload()` — resume the same URL, fresh data.
- Different user id → `window.location.href = '/'` — a hard navigation (not `useNavigate`, for
  the same stale-memory reason the reload exists at all) to the same landing spot a normal fresh
  login without a `from` target would use.

This deliberately diverges from `LoginPage`'s existing "always return to `from`, let the page's
own not-found/permission handling cover an inaccessible target" precedent (its own comment
explains that choice). The difference: `LoginPage`'s flow is already a full route
navigation — nothing carries over from before, so there's no memory-leak vector regardless of
who logs in. The session-expiry modal's whole premise is "there is live in-memory state from a
specific previous identity, mid-view" — once identity provably changes, resuming that same deep
view isn't just "possibly inaccessible" (already handled gracefully elsewhere), it's actively
the wrong place to put a different person.

**The modal states why it appeared, and autofocuses password, not email.** An unexplained,
non-dismissable overlay reads as the app breaking — the modal needs an explicit line ("Your
session has expired. Log back in to continue where you left off.") so it reads as deliberate.
Separately, `LoginForm` as extracted from `LoginPage` autofocuses email (the right default when
the field starts empty) — but here email is pre-filled specifically so the common case (same
person, just needs their password) is fast, so the modal must move focus to password on open
(`DialogContent`'s `onOpenAutoFocus`, preventing Radix's default and focusing the password input
directly) rather than reuse `LoginForm`'s default autofocus behavior unmodified.

**`login()` returns the authenticated user.** A small, backward-compatible extension
(`{ ok: true, user } | { ok: false, error }`) — both `LoginPage` and the modal need the fresh
user's id to compare identity; refetching it separately would be a wasted round-trip.

**Extract `LoginForm` out of `LoginPage`.** The modal needs the exact same
email/password/error-state/submit logic; duplicating it would drift over time (two places to
fix the same bug). `LoginPage` becomes a thin wrapper: page chrome + `LoginForm` +
its own post-login navigation (`from`-aware, unchanged). The modal wraps the same `LoginForm`
with its own post-login logic (reload vs. redirect-home).

**Only `401` is intercepted; `403` is untouched.** `403` means "authenticated but not permitted"
— an existing, separate concern each page already handles (not-found/permission UI, per
`LoginPage`'s own precedent comment). This change never conflates the two.

**Visual treatment: no new styling.** The modal reuses `Card`/`Dialog`'s existing neutral
tokens — the same ones `LoginPage` already uses. This isn't a destructive or alarming action, so
it gets no red, no new iconography, no departure from the calm, restrained treatment already
established. A non-dismissable modal is a strong enough signal on its own without visual
escalation.

**The keyboard trap is intentional and WCAG-defensible, not an oversight.** WCAG 2.1.2 ("No
Keyboard Trap") requires that focus can be moved away using only the keyboard *unless the user
is advised of the method* — a login modal with a completable exit path (enter valid credentials)
is the standard, widely-accepted exception every bank/email/SaaS re-auth prompt relies on, not a
genuine trap.

## Risks / Trade-offs

- A hard reload/navigation loses any unsaved form input the user had open elsewhere on the page
  at the moment of expiry. Accepted: there's no safe way to preserve that without risking the
  exact data-leak this change exists to prevent, and it's already true of the first-load
  redirect case today.
- `window.location.reload()` re-fetches everything, including data that may not have changed —
  acceptable since session expiry is not a frequent event (30-day sliding window).
