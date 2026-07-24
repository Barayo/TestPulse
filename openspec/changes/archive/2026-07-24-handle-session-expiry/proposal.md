## Why

When a user's session expires while they're actively using the app (cookie expiry, server-side
revocation), every subsequent API call fails with `401`, but nothing in the web app reacts to
that — pages render whatever empty/broken state their own data-fetching code happens to produce
instead of prompting re-authentication. The user reported this directly: "When I loose the
session, the web looks like empty instead of redirecting me to login screen." `RequireAuth`
already handles the *first-load* case (never authenticated → redirect to `/login`), but there's
no equivalent for a session that goes bad mid-use.

## What Changes

- A global response interceptor on the `api` client (`apps/web/src/lib/api.ts`) detects any
  `401` response (excluding the login endpoint itself) and notifies `AuthProvider`.
- `AuthProvider` only reacts if it currently believes the user is authenticated (`user !== null`
  at the time the `401` arrives) — a `401` before the first successful login is the existing
  first-load case, already handled by `RequireAuth`'s redirect, and must not double-fire this.
- On a genuine mid-use expiry, a **non-dismissable login modal** renders on top of the current
  view — no route navigation, no loss of place, no Escape/click-outside/close-button dismissal.
  Inline error messaging on failed re-auth (wrong password), matching `LoginPage`'s existing
  style — no toast.
- The modal **pre-fills the email** of whoever was previously logged in, but the field stays
  **editable** — switching to a different account from the modal is explicitly allowed.
- On successful re-auth, the app **hard-reloads** rather than resuming in place — explicit
  rationale: the newly-authenticated session might belong to a different user, have different
  privileges, or see different data, and resuming with data already held in memory from the
  *previous* session risks a data leak. Concretely:
  - If the re-authenticated user's id matches who was logged in before → hard-reload the
    **current URL** (`window.location.reload()`), resuming the same view with fresh data.
  - If it's a **different** user → hard-navigate to **`/`** (`window.location.href = '/'`)
    instead — dropping a different person into a stranger's deep page is disorienting, and a
    fresh login's natural landing spot is home regardless.
- `useAuth()`'s `login()` gains the authenticated user in its success result (`{ ok: true, user
  }`), a small extension so both `LoginPage` and the new modal can compare identities without a
  second round-trip.
- `LoginPage`'s form (email/password/error state, the actual `login()` call) is extracted into a
  shared `LoginForm` component so the modal reuses it exactly rather than duplicating it.

## Capabilities

### Modified Capabilities
- `ui-navigation`: adds a new requirement for how the web UI reacts to a session going invalid
  mid-use, alongside the existing route/auth-gating behavior.

## Impact

- `apps/web/src/lib/api.ts` — response interceptor.
- `apps/web/src/lib/sessionExpiry.ts` (new) — tiny subscribe/notify bridge from the plain-module
  API client into React (`AuthProvider` can't be reached directly from `api.ts`).
- `apps/web/src/lib/useAuth.tsx` — subscribes to session-expiry notifications, gates on
  `user !== null`, exposes `sessionExpired` state; `login()` returns the authenticated user.
- `apps/web/src/components/LoginForm.tsx` (new, extracted from `LoginPage.tsx`) +
  `apps/web/src/components/SessionExpiredModal.tsx` (new).
- `apps/web/src/pages/LoginPage.tsx` — uses the extracted `LoginForm`.
- `apps/web/src/App.tsx` — renders `SessionExpiredModal` inside `AuthProvider`, above the routed
  content.
- `openspec/specs/ui-navigation/spec.md` — new requirement.
- `docs/api.md`'s "Authentication" section — small addition describing the new mid-use behavior,
  alongside the existing session-cookie description.
