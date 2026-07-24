## 1. Session-expiry bridge (TDD)

- [x] 1.1 Write tests for `apps/web/src/lib/sessionExpiry.ts`: `onSessionExpired` registers a
      listener that `notifySessionExpired` calls; the returned unsubscribe function stops future
      calls; multiple listeners all fire. Watch fail first.
- [x] 1.2 Implement `sessionExpiry.ts` — a `Set<() => void>` of listeners behind
      `onSessionExpired(cb): () => void` and `notifySessionExpired(): void`.
- [x] 1.3 Verify green.

## 2. API interceptor (TDD)

- [x] 2.1 Write tests for `apps/web/src/lib/api.ts`: a `401` response on a non-excluded request
      calls `notifySessionExpired` (mock the module); a `401` on `POST /api/v1/auth/login` does
      not; a `401` on `POST /api/v1/auth/logout` does not; a non-`401` response does not. Watch
      fail first.
- [x] 2.2 Implement: register an `onResponse` middleware via `api.use()` that checks
      `response.status === 401` and excludes the login and logout request paths, calling
      `notifySessionExpired()` otherwise; always returns the response unchanged (never swallows
      it).
- [x] 2.3 Verify green. Also grep the codebase for any direct `fetch(` calls that bypass the
      shared `api` client — none found; every request goes through `api.ts`.

## 3. useAuth: gate, expose state, return user from login (TDD)

- [x] 3.1 Write tests for `useAuth.tsx`: `notifySessionExpired()` while `user` is set makes
      `sessionExpired` become `true`; calling it while `user` is `null` (first load) does not;
      `login()`'s success result includes the authenticated `user`. Watch fail first.
- [x] 3.2 Implement: subscribe to `onSessionExpired` in a `useEffect`, guard on `user !== null`,
      add `sessionExpired` to the context value — setting it `true` is the *only* effect; never
      clear `user` when it fires (that's what keeps `RequireAuth`'s own redirect from racing this
      modal). No reset/clear setter for `sessionExpired` is needed: every exit from the modal is
      a hard reload or hard navigation, which discards this state for free — don't build one.
      Change `login()`'s success return to `{ ok: true, user }`.
- [x] 3.3 Verify green; update existing `useAuth`/`LoginPage` tests whose mocked `login()`
      return shape changed.

## 4. Extract LoginForm (TDD)

- [x] 4.1 Write tests for the new `apps/web/src/components/LoginForm.tsx`: renders email/password
      fields and a submit button; accepts an optional `initialEmail` prop that pre-fills the
      email field; calls `login()` and, on success, calls an `onSuccess(user)` prop; on failure,
      shows the inline error and calls no success callback. Watch fail first.
- [x] 4.2 Extract the form (state, submit handler, inline error markup) out of `LoginPage.tsx`
      into `LoginForm.tsx`, taking `onSuccess: (user: AuthUser) => void` and an optional
      `initialEmail?: string` prop (defaults to autofocusing email as today; the modal overrides
      focus separately at the `DialogContent` level, per task 5.2, since focus-on-open is a
      dialog-level concern, not the form's).
- [x] 4.3 Update `LoginPage.tsx` to render `LoginForm` with its existing `from`-aware navigation
      as the `onSuccess` callback; verify its existing tests still pass.
- [x] 4.4 Verify green.

## 5. SessionExpiredModal (TDD)

- [x] 5.1 Write tests for `apps/web/src/components/SessionExpiredModal.tsx`: renders nothing
      when `sessionExpired` is `false`; renders a non-dismissable `Dialog` (no close button,
      Escape/outside-click intercepted) with an explanatory heading and `LoginForm` pre-filled
      with the previous user's email when `true`; on `LoginForm`'s `onSuccess`, calls
      `window.location.reload()` when the new user's id matches the previous one, or sets
      `window.location.href = '/'` when it differs. Watch fail first.
- [x] 5.2 Implement the component using `Dialog`/`DialogContent` with `showCloseButton={false}`,
      `onEscapeKeyDown`/`onPointerDownOutside` calling `event.preventDefault()`, and
      `onOpenAutoFocus` preventing Radix's default and focusing the password input instead.
- [x] 5.3 Wire it into `App.tsx`, rendered once inside `AuthProvider`, above the routed content.
- [x] 5.4 Verify green; check pristine output; run `make coverage-web`.

## 6. E2E

- [x] 6.1 Add e2e scenarios corrupting the session cookie directly via Playwright's own
      `context.addCookies()` — no backend test-only endpoint. Covers: modal opens with
      explanatory copy and pre-filled email; non-dismissable via Escape/no close button;
      same-user re-auth resumes the same URL; different-user re-auth goes home. Found and fixed
      a real race in the test design itself (not the app): corrupting the cookie immediately
      after `page.goto('/')` without waiting for the *original* session check to resolve
      sometimes raced that first-load check, incorrectly landing on `/login` instead of
      exercising the mid-use path — fixed by waiting for the authenticated view before
      corrupting the cookie in every scenario.
- [x] 6.2 Run `make e2e`; full suite (62 specs) passes.

## 7. Docs

- [x] 7.1 Added a paragraph to `docs/api.md`'s "Authentication" section describing the mid-use
      expiry modal, alongside the existing session-cookie description.

## 8. Sample Project showcase

- [x] 8.1 Confirmed exempt — cross-cutting frontend auth-flow fix, no new seed-able content or
      capability the Sample Project's data could demonstrate.

## 9. Archive

- [x] 9.1 Archive this change once all tasks above are complete and verified.
