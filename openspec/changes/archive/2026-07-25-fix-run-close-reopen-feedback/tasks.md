## 1. Close/reopen: immediate status + in-progress button state

- [x] 1.1 Write a failing `RunPage.test.tsx` test: closing a run updates the
      status badge without re-fetching items/summary
- [x] 1.2 Write a failing test: the close button shows a disabled
      "Closing…" state while the request is in flight
- [x] 1.3 Update `closeRun` in `RunPage.tsx` to set `run.status` locally on
      success (closing/reopening never changes items/summary, so no
      re-fetch is needed at all — stronger than the original "fetch just
      the run" idea), track an `isClosing` state for the button, and call
      `bumpDataRevision()` on success
- [x] 1.4 Repeat 1.1-1.3 for `reopenRun` / "Reopening…"
- [x] 1.5 Verify both tests pass; verify existing RunPage tests still pass
      (all 27 pass; also fixed an unrelated over-fetch this surfaced — the
      project-name effect depended on the whole `run` object, re-firing on
      every local status update; narrowed to `run?.projectKey`)

## 2. Negative paths

- [x] 2.1 Write a failing test: a generic close/reopen failure re-enables
      the button and shows the existing error message
- [ ] 2.2 A `401` during close/reopen opens the session-expired modal —
      **not independently tested here**: `sessionExpiryMiddleware`
      already intercepts any non-login/logout `401` globally (proven in
      `session-expiry.spec.ts`), and this action adds no new code path
      that could interfere with it. Judged not worth a dedicated test.

## 3. E2E coverage

- [ ] 3.1 **Deferred to `redesign-run-execution-view`** — that change
      restructures this exact page's interaction model (item click
      navigates to a new route instead of selecting inline) immediately
      after this one; writing e2e coverage against the soon-to-be-replaced
      inline model would just be rewritten again. Its own e2e task list
      covers the equivalent ground against the new model.

## 4. Docs and sample project

- [x] 4.1 No doc changes needed — confirmed nothing in `docs/` describes
      the old multi-request refresh behavior
- [x] 4.2 Sample Project showcase: not applicable — pure UI
      responsiveness fix, no new seed-data-visible capability

## 5. Sync and validate

- [x] 5.1 Run `openspec-sync-specs` for `fix-run-close-reopen-feedback`
- [x] 5.2 `openspec validate fix-run-close-reopen-feedback --strict`
