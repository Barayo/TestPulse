## 1. Shared groundwork

- [x] 1.1 Write a failing test asserting `App.tsx`'s `Layout` renders an
      anonymous-viewer banner ("You're viewing this without an account...")
      and a "Log in" link carrying the current path as `loginFrom` router
      state when `!user && !loading`, and renders neither when `user` is
      present. Confirm it fails.
      — Extracted `Layout` to `apps/web/src/components/Layout.tsx` (with
      its own `Layout.test.tsx`) so it's testable in isolation, matching
      the codebase's one-component-per-file convention. RED confirmed by
      temporarily removing the file and watching the import fail.
- [x] 1.2 Implement the banner in `Layout`, positioned directly above
      `<main>` (matching the old `PublicHeader`'s visual position), reusing
      its copy. Confirm the existing chrome conditionals (`{user && (...)}`
      for `AdminMenu`/`UserMenu`, `permissions?.manageProject` for
      Settings, `user?.isTenantAdmin` for Members) already correctly
      render nothing for `!user` — add a test asserting this explicitly if
      not already covered. Make 1.1's test pass.
- [x] 1.3 (design.md D9) Restructure `App.tsx`'s route table into two
      explicitly named groups: `ACCOUNT_ONLY_ROUTES` (rendered inside
      `RequireAuth`, unchanged behavior) and `PROJECT_CONTENT_ROUTES`
      (rendered outside it — the 9 routes tasks 3-11 below move into this
      group). Add a route-manifest test in `App.test.tsx` that enumerates
      every registered route and asserts each appears in exactly one of
      the two groups, failing CI if a future route is added to neither or
      both. Land this before any per-page "move out of `RequireAuth`"
      task below — those tasks target this structure, not an ad hoc
      unwrap.
      — Implemented as two exported `RouteEntry[]` arrays that `<Routes>`
      maps over — the only two sources of a route in the file, so the
      "fails CI if added to neither" guarantee holds by construction, not
      just via the added overlap/duplicate test (sanity-checked: verified
      the test actually fails when a duplicate path is injected, then
      reverted). All 10 project-content routes still render through
      `RequireAuth` for now (unchanged behavior) via a new `AllowAnonymous`
      wrapper that exists but isn't wired to any route yet — each per-page
      task below (3.3, 4.3, ...) flips its one route's wrapper. All 862
      web tests, typecheck, and lint stayed green through this refactor.

## 2. Permission-gating retrofit (backlog #110) — prerequisite for every page below

Security review (2026-08-10) found the retrofit scope broader than
originally assessed on two pages, plus a shared component with no gating
at all, plus one page (`FolderExplorerPage`) incorrectly assumed to
already be correct. Corrected list:

- [x] 2.1 `SuiteActionsMenu.tsx` (shared by `SuiteDetailPage` and
      `SuitesPage`) — write failing tests asserting Run suite
      (`runCreate`), Rename (`suiteEditMembership`), and Delete
      (`manageProject`) are each hidden when the caller's permissions lack
      the matching flag. Confirm they fail. Implement gating. Make tests
      pass. Gated once here, not duplicated per page.
- [x] 2.2 `SuiteDetailPage.tsx` — verify (read current content first)
      whether it renders any write control beyond `SuiteActionsMenu`; gate
      anything found the same way. Depends on 2.1.
      — Found one: `SuiteCaseGrid` (the page's case list IS its editor —
      checkboxes + Save changes) had no gating at all. Added a `readOnly`
      prop threaded through `SuiteCaseGrid` → `CasePicker` (genuinely
      disables checkboxes, not just visual) gated on
      `suiteEditMembership`, hiding the selection-count/commit footer
      entirely when read-only. Wired `useProjectPermissions` into the
      page, passing `permissions` to `SuiteActionsMenu` and
      `readOnly={!permissions?.suiteEditMembership}` to `SuiteCaseGrid`.
- [x] 2.3 `CaseDetailPage.tsx` — gate Edit/Delete (`caseEdit`/`caseDelete`)
      **and** the "Move to…" action (`caseEdit`, same flag as Edit — list
      it explicitly so it isn't missed).
      — Also gated "+ Add steps" (the empty-state entry point into edit
      mode, same as Edit — `caseEdit`) and hid the actions-menu trigger
      entirely when it would end up with zero items.
- [x] 2.4 `RunItemDetailPage.tsx` — gate the record-verdict controls,
      Retest, and "Assign to…" (all `runRecordResult`), **and** attachment
      upload/remove (`runRecordResult`) — broader than "record-verdict
      controls" alone.
      — Also gated the keyboard-shortcut handler (P/F/B/S/R no longer fire
      without `runRecordResult`) and the shortcuts-hint list itself, so it
      never advertises a shortcut that wouldn't do anything.
- [x] 2.5 `RunPage.tsx` — gate Close (`runRecordResult`) and Reopen
      (`manageProject`), **and** per-item "Assign to…" and bulk
      verdict-setting (both `runRecordResult`) — broader than
      "Close/Reopen" alone.
      — Also gated bulk "Assign selected…". "Open execution"/"Go to case
      in Library" stay ungated (pure navigation, no write).
- [x] 2.6 `SuitesPage.tsx` — gate the "+ New suite" button and Create-suite
      dialog action (`suiteCreate`). Depends on 2.1 for the per-suite-card
      menu this page also renders.
      — Done together with 2.1 since `SuiteActionsMenu`'s new `permissions`
      prop is required (TypeScript-enforced) and this page is its second
      caller. Threaded `useProjectPermissions` through, gated "+ New
      suite" on `suiteCreate`, passed `permissions` to each `SuiteCard`.
- [x] 2.7 `RunsPage.tsx` — gate the "+ New run" links (`runCreate`).
      Both the header button and the empty-state CTA.
- [x] 2.8 `NewRunPage.tsx` — gate the entire create-run form behind
      `runCreate`, showing a permission-denied message instead for an
      authenticated user who lacks it and navigates there directly.
      `NewRunPage` is not part of the dual-mode migration below — it has
      no anonymous-viewable content, so it stays in `ACCOUNT_ONLY_ROUTES`
      (task 1.3).
      — Used `permissions !== undefined && !permissions.runCreate` (the
      same "loaded and confirmed denied, not just still loading" pattern
      `ProjectSettingsPage.tsx` already establishes) so a privileged user
      never sees a false denial flash.
- [x] 2.9 `FolderExplorerPage.tsx` — **corrects an earlier false
      assumption that this page needed no retrofit.** Only its Delete
      action is currently gated; gate "+ New section" (`sectionCreate`),
      "+ New test case" (`caseCreate`), and the row-level "Move to…"
      action (`caseEdit`) as well.
      — Also found and gated a second, separate entry point into folder
      creation: `FolderTree.tsx`'s per-row "New section in…" context-menu
      trigger, not mentioned anywhere in the original retrofit scope. Added
      an optional `canCreate` prop (default `true`, since the tree's only
      real caller is this page and always passes it explicitly) rather
      than updating all 18 of `FolderTree.test.tsx`'s existing render call
      sites.

For every task above: implement gating, make the new tests pass, then
verify every existing authenticated-mode test for that page/component
still passes unmodified — this retrofit changes real UI behavior for
under-permissioned authenticated users (buttons that used to always
render now sometimes don't) and must be independently verified before any
page below depends on it.

## 3. `SuiteDetailPage` — dual-mode + unwrap from `RequireAuth`

- [x] 3.1 Write a failing test asserting `SuiteDetailPage` fetches from
      `/api/v1/public/suites/{suiteKey}` (and its trend endpoint) when
      `useAuth().user` is absent AND `!loading`, and from the authenticated
      equivalents when `user` is present — and asserts **no** request
      fires while `loading` is still `true` (design.md D2's corrected
      race-guard). Confirm it fails. Implement the branch. Make it pass.
      — No trend endpoint call actually exists on this page (task text's
      parenthetical was inaccurate); the real 4 endpoints (project, cases,
      folders, suite) all have confirmed public equivalents.
- [x] 3.2 Write a failing test asserting an anonymous visitor on a public
      project sees the identical rendered suite detail a member with read
      access sees, with zero write controls. Confirm it fails, then passes
      after 2.1, 2.2, and 3.1 are all in place.
- [x] 3.3 Move `/projects/:projectKey/suites/:suiteKey` into
      `PROJECT_CONTENT_ROUTES` (task 1.3). Verify existing authenticated-mode
      tests for this page still pass unmodified.
      — Added `anonymous: true` to this route's `RouteEntry` in `App.tsx`.

## 4. `CaseDetailPage` — dual-mode + unwrap from `RequireAuth`

- [x] 4.1 Write a failing test asserting `CaseDetailPage` fetches case
      detail/versions/executions from `/api/v1/public/cases/{caseKey}/...`
      when anonymous and `!loading`, with no request while `loading` is
      `true`. **Per design.md D1/D10: the anonymous branch must not call
      `GET /api/v1/users` — that endpoint has no public equivalent and
      must not get one.** Confirm the test fails. Implement. Make it pass.
      — Also found and fixed the same satellite-fetch gap design.md flagged
      for RunPage/RunItemDetailPage, in a place the task list didn't name:
      `VersionDetailDialog.tsx` (opened via "View executions") does its own
      independent `GET /api/v1/cases/{caseKey}/executions` fetch — gated
      it the same way, with its own `useAuth()` branch and loading guard,
      verified with its own dual-mode test.
- [x] 4.2 Write a failing test asserting an anonymous visitor sees the
      identical case detail a member sees, **except** version/result-history
      rows show no resolved author name (D10 — omitted, not a broken-looking
      blank; exact copy left to implementation), with zero write controls.
      Confirm it fails, then passes after 2.3 and 4.1.
      — D10 required no new UI: version rows already guard the author
      name/avatar on `author &&`, so an empty `userIdentities` (never
      populated when anonymous) already omits it correctly.
- [x] 4.3 Move `/projects/:projectKey/cases/:caseKey` into
      `PROJECT_CONTENT_ROUTES` (task 1.3). Verify existing authenticated-mode
      tests still pass unmodified.

## 5. `RunItemDetailPage` — dual-mode + unwrap from `RequireAuth`

- [x] 5.1 Write a failing test asserting `RunItemDetailPage` fetches
      results from `/api/v1/public/items/{itemID}/results` when anonymous
      and `!loading`, with no request while `loading` is `true`. Include
      the page's satellite suite-name fetch (currently a separate
      always-authenticated effect) in the same branch. **Per D1/D10: must
      not call `GET /api/v1/users`.** Confirm it fails. Implement. Make it
      pass.
      — Correction: the satellite effect is for the *project* name
      (breadcrumb), not a suite — this page has no suite-name fetch at
      all; task text's parenthetical was inaccurate. Branched it the same
      way as the main `load()` call.
- [x] 5.2 Write a failing test asserting an anonymous visitor sees the
      identical run-item detail a member sees, except result-history
      author names are omitted (D10), with zero record-verdict/Retest/
      Assign/attachment controls. Confirm it fails, then passes after 2.4
      and 5.1.
- [x] 5.3 Move `/runs/:runKey/items/:caseKey` into `PROJECT_CONTENT_ROUTES`
      (task 1.3). Verify existing authenticated-mode tests still pass
      unmodified.

## 6. `RunPage` — dual-mode + unwrap from `RequireAuth`

- [x] 6.1 Write a failing test asserting `RunPage` fetches
      run/items/summary from `/api/v1/public/runs/{runKey}/...` when
      anonymous and `!loading`, with no request while `loading` is `true`.
      Include the page's satellite breadcrumb project-name fetch
      (currently a separate always-authenticated effect) in the same
      branch. Confirm it fails. Implement. Make it pass.
      — Also branched the suite-name satellite fetch (`GET /api/v1/suites/{suiteKey}`,
      "From suite: ..." breadcrumb line) the same task text didn't name.
- [x] 6.2 Write a failing test asserting an anonymous visitor sees the
      identical run detail a member sees, with zero
      Close/Reopen/Assign/bulk-verdict controls. Confirm it fails, then
      passes after 2.5 and 6.1.
- [x] 6.3 Move `/runs/:runKey` into `PROJECT_CONTENT_ROUTES` (task 1.3).
      Verify existing authenticated-mode tests still pass unmodified.

## 7. `SuitesPage` — dual-mode + unwrap from `RequireAuth`

- [x] 7.1 Write a failing test asserting `SuitesPage` fetches from
      `/api/v1/public/projects/{projectKey}/suites` when anonymous and
      `!loading`, with no request while `loading` is `true`. Confirm it
      fails. Implement. Make it pass.
- [x] 7.2 Write a failing test asserting an anonymous visitor sees the
      full suites list with zero "+ New suite" affordance and zero
      per-card action menu. Confirm it fails, then passes after 2.1, 2.6,
      and 7.1.
- [x] 7.3 Move `/projects/:projectKey/suites` into `PROJECT_CONTENT_ROUTES`
      (task 1.3). Verify existing authenticated-mode tests still pass
      unmodified.
      — Also added a "Log in" link to the not-found state (design.md D3),
      matching every other migrated page even though task text didn't
      call it out explicitly here.

## 8. `RunsPage` — dual-mode + unwrap from `RequireAuth`

- [x] 8.1 Write a failing test asserting `RunsPage` fetches from
      `/api/v1/public/projects/{projectKey}/runs` when anonymous and
      `!loading`, with no request while `loading` is `true`. Confirm it
      fails. Implement. Make it pass.
- [x] 8.2 Write a failing test asserting an anonymous visitor sees the
      full runs list with zero "+ New run" affordance. Confirm it fails,
      then passes after 2.7 and 8.1.
- [x] 8.3 Move `/projects/:projectKey/runs` into `PROJECT_CONTENT_ROUTES`
      (task 1.3). Verify existing authenticated-mode tests still pass
      unmodified.

## 9. `FolderExplorerPage` — dual-mode + unwrap from `RequireAuth`

(Depends on 2.9's retrofit — see the corrected note there; this page was
not already fully gated.)

- [x] 9.1 Write a failing test asserting `FolderExplorerPage` fetches
      folders/cases from `/api/v1/public/projects/{projectKey}/...` when
      anonymous and `!loading`, with no request while `loading` is `true`,
      including the classification pills already shipped for the
      (now-retired) public page. Confirm it fails. Implement. Make it
      pass.
- [x] 9.2 Write a failing test asserting an anonymous visitor sees the
      identical Library (section tree, case rows with pills, drag-move
      affordances excluded) a member with read access sees, with zero
      create/move/delete controls. Confirm it fails, then passes after
      2.9 and 9.1.
      Implementation notes: `FolderTree` gained `canCreate?: boolean`
      (default `true`, not required) to hide its per-row "New section
      in…" trigger for anonymous/no-permission callers — kept optional
      with a default rather than required, since only
      `FolderExplorerPage` calls it and always passes it explicitly;
      making it required would have forced editing 18 pre-existing test
      call sites for zero behavioral gain. Not-found state also gained
      the standard "Log in" link (`!user && !authLoading`) per D3.
- [x] 9.3 Move `/projects/:projectKey/library` and
      `/projects/:projectKey/library/:folderId` into
      `PROJECT_CONTENT_ROUTES` (task 1.3). Verify existing
      authenticated-mode tests still pass unmodified.

## 10. `ProjectPage` — dual-mode + unwrap from `RequireAuth`

(Permission gating already correct here, re-verified during security
review — no task 2.x dependency.)

- [x] 10.1 Write a failing test asserting `ProjectPage` fetches project
      metadata and landing data (folders/cases/suites/runs, run summaries)
      from `/api/v1/public/...` when anonymous and `!loading`, with no
      request while `loading` is `true` — extend `useProjectLanding` with
      the branch from design.md D2, or introduce a sibling hook if the
      existing one's authenticated-only assumptions make branching
      awkward (implementer's judgment; either way, same test contract).
      Confirm it fails. Implement. Make it pass.
      Implementation notes: `useProjectLanding` took `user`/`authLoading`
      as explicit parameters rather than calling `useAuth()` internally —
      keeps it callable from a bare `renderHook()` with no `AuthProvider`
      wrapper (its existing abort-behavior test) and keeps the dual-mode
      branch a visible fact of the call site, per D2. Also branched its
      internal `/api/v1/runs/{runKey}/summary` call (undocumented by this
      task's own wording, which said "run summaries" but didn't call out
      the per-run summary fetch specifically) to
      `/api/v1/public/runs/{runKey}/summary`, matching the pattern
      `RunPage` already established for the same endpoint.
- [x] 10.2 Write a failing test asserting an anonymous visitor on a
      publicly accessible project sees the identical summary strip
      (health ring, suite/case counts, last-run preview) and
      Library/Suites/Runs panels a member sees, with the Members/Settings
      links and project switcher chevron absent. Confirm it fails, then
      passes.
      Implementation notes: no public equivalent exists for the batched
      `/api/v1/projects/summaries` aggregate `useProjectSummaries()`
      calls, so the anonymous summary strip is derived client-side from
      `useProjectLanding`'s already-dual-mode output (`totalSuites`,
      `totalCases`, `runs[0]`) once `landing.loaded` — `useProjectSummaries`
      itself is untouched, matching D2's "latest-run pass rate" semantics
      exactly since `landing.runs[0]` is already sorted most-recent-first.
- [x] 10.3 Write a failing test asserting the "not found" branch renders
      for an anonymous visitor on a private or nonexistent project, with a
      "Log in" link (carrying `loginFrom`) alongside the existing "Go to
      Projects" link. Confirm it fails. Implement. Make it pass.
      Implementation notes: "carrying `loginFrom`" refers to the
      now-retired `PublicHeader` prop name; the actual mechanism (per D3)
      is `<Link to="/login" state={{ from: ... }}>`, matching every other
      migrated page in this change.
- [x] 10.4 Move `/projects/:projectKey` into `PROJECT_CONTENT_ROUTES`
      (task 1.3). Verify existing authenticated-mode tests still pass
      unmodified.
      Correction: `/projects/:projectKey` was already in
      `PROJECT_CONTENT_ROUTES` (added in task 1.3 alongside `/`) — this
      task only needed to flip its `anonymous` flag to `true`.

## 11. `ProjectsPage` (`/`) — anonymous discovery branch

- [x] 11.1 Write a failing test asserting `ProjectsPage` fetches
      `/api/v1/public/projects` and applies the zero/one/many resolution
      (redirect on exactly one, list on 2+, empty state on 0) when
      `useAuth().user` is absent and `!loading`, with no request while
      `loading` is `true` — port the logic from the now-retired
      `PublicProjectsIndexPage`/`usePublicProjects`, adapted to
      `ProjectsPage`'s existing component rather than a new page. Confirm
      it fails. Implement. Make it pass.
      Implementation notes: the anonymous card grid links to
      `/projects/{key}` (the now-anonymous-capable unified route, task
      10.4), not the retiring `/public/{key}`. The ported fetch also
      needed a `.catch()` the original `usePublicProjects()` lacked —
      surfaced by `App.test.tsx`'s "API cannot be reached at all" test,
      which now exercises `/` as the anonymous branch and turned the
      un-caught rejection into an unhandled-rejection failure.
- [x] 11.2 Check whether `useProjectSummaries()`'s `[]`-loading-sentinel
      default (design.md Open Questions) causes an incorrect empty-state
      flash in this anonymous path the way it does for the authenticated
      single-project redirect. If it does, fix it as part of this task
      (in scope now, unlike the prior two changes where it wasn't
      triggered); if not, leave it and note why in a code comment.
      Finding: no flash — the anonymous branch renders from its own new
      `publicProjects: Project[] | undefined` state (D5 discipline,
      undefined until loaded), entirely separate from
      `useProjectSummaries()`'s `[]`-defaulting hook. That hook still
      fires unconditionally (unused for anonymous rendering, same as
      `useProjectPermissions` firing harmlessly for every anonymous page
      in this change) but never feeds the anonymous render path, so its
      pre-existing bug has no surface here. Noted inline in
      `ProjectsPage.tsx`.
- [x] 11.3 Move `/` into `PROJECT_CONTENT_ROUTES` (task 1.3). Verify
      existing authenticated list/search/sort/filter tests still pass
      unmodified.
      Correction: `/` was already in `PROJECT_CONTENT_ROUTES` (task
      1.3) — this task only needed to flip its `anonymous` flag to
      `true`.

## 12. Retire the standalone public pages and redirect old URLs

- [x] 12.1 Add a redirect from `/public/:projectKey` to
      `/projects/:projectKey` in `App.tsx`, via a small component reading
      `useParams()` and rendering `<Navigate>` (react-router doesn't
      interpolate params in a literal `to` string). **Per design.md D7:
      this component must not fetch or otherwise check whether the
      project exists or is public — a pure, existence-blind path rewrite.
      The destination page (already unwrapped per task 1.3/10.4) owns the
      not-found/non-disclosure decision entirely.** Write a failing test
      asserting `/public/SP` navigates to `/projects/SP` without any
      network request. Make it pass.
      Implementation notes: proved "without any network request" by
      mocking every `GET` to hang forever and asserting the URL still
      changes — if the redirect had waited on any round-trip first, it
      never would.
- [x] 12.2 Same for `/public` → `/`, same existence-blind constraint.
      Write a failing test, make it pass.
      Implementation notes: this one needed no dedicated component — a
      literal `<Route path="/public" element={<Navigate to="/" replace />} />`.
- [x] 12.3 Delete `PublicProjectPage.tsx`, `PublicProjectPage.test.tsx`,
      `PublicProjectsIndexPage.tsx`, `PublicProjectsIndexPage.test.tsx`,
      `usePublicProjects.ts`, `usePublicProjects.test.tsx`,
      `PublicHeader.tsx`, `PublicHeader.test.tsx` — their behavior is now
      fully subsumed by `Layout` (task 1) and the per-page dual-mode work
      (tasks 3-11). Run the full web test suite; fix any now-broken
      import.
      Verified no dangling imports first (`grep -rl` across `src/`) —
      the only remaining references were code comments in `Layout.tsx`/
      `ProjectsPage.tsx`/`ProjectsPage.test.tsx` naming the retired
      modules for context, not actual imports. Suite dropped from 935 to
      924 tests (the 11 tests that lived in the 4 deleted `.test.tsx`
      files), all still green.
- [x] 12.4 Update `LoginPage.tsx`'s "Browse public projects without an
      account" link target from `/public` to `/` (still gated on
      `publicProjectsEnabled`, unchanged). Update its existing test to
      match.

## 13. Sample Project showcase

- [x] 13.1 No `seed.go` change needed — the Sample Project is already
      marked public, which is what makes the anonymous single-project
      redirect (task 11.1) demonstrable on a fresh install. Explicitly
      verified rather than silently skipped, per the standing Sample
      Project rule.
      Verified: `PublicAccess: &publicAccess` (true) at seed.go:59-62,
      covered by seed_test.go's existing assertion. Its explanatory
      comment referenced the retired `/public/{key}` URL shape, though —
      fixed to describe the unified `/projects/{key}` URL and the `/`
      single-project auto-redirect it now enables, so the comment doesn't
      drift behind this change. `go build ./...` and
      `go test ./internal/sampledata/...` both pass.

## 14. Documentation

- [x] 14.1 Rewrite `docs/test-management.md`'s "Public project access"
      section: remove references to a separate minimal public page and a
      standalone `/public` index; describe the unified model (same pages,
      read-only for anonymous visitors, `/` as the discovery surface,
      author names omitted from version/result history per D10).
      Also updated `docs/deployment.md`'s access-control summary
      paragraph, which still described the retired `/public/{key}` URL
      as the stable public shape — found while grepping `docs/` for
      `/public` references beyond the two files this task named.
      `docs/api.md`'s `/api/v1/public/...` references are the backend API
      surface, unaffected by this change, left as-is.
- [x] 14.2 Update `docs/getting-started.md`'s quickstart to match — the
      "Browse public projects without an account" link now leads to `/`,
      and `/public/SP` still works but as a redirect, not a distinct page.

## 15. End-to-end verification

- [x] 15.1 Rewrite `apps/web/e2e/public-project-access.spec.ts` against
      the unified URLs: enabling public access on a project makes
      `/projects/{key}` (not `/public/{key}`) readable anonymously with no
      write controls; disabling it immediately revokes that; the
      instance-wide kill switch overrides per-project settings as before;
      `/public/{key}` and `/public` redirect correctly; `/` resolves
      zero/one/many for anonymous visitors; the login page's discovery
      link appears/disappears with the instance-wide switch; logging in
      from an anonymously-viewed project returns to that project,
      authenticated.
      Implementation notes: also found and fixed a real, previously
      untested gap — `ProjectSettingsPage.tsx` was still displaying and
      copying the retired `/public/{projectKey}` URL as the "shareable"
      public link, instead of the project's own unified `/projects/{key}`
      URL. Fixed via its own RED→GREEN cycle
      (`ProjectSettingsPage.test.tsx`). Also added the previously-untested
      "multiple public projects show a list" scenario (spec.md's
      `Requirement: Project list resolves to zero, one, or many public
      projects for anonymous visitors` had no E2E coverage for its
      2+ case before this).
- [x] 15.2 Add E2E coverage for the task-2 permission-gating retrofit:
      an authenticated user with a role lacking `suiteCreate`/`runCreate`/
      `caseEdit`/`caseDelete`/`runRecordResult`/`suiteEditMembership`/
      `manageProject` does not see the corresponding controls on
      `SuitesPage`/`RunsPage`/`CaseDetailPage`/`RunItemDetailPage`/
      `RunPage`/`FolderExplorerPage`/`SuiteActionsMenu`.
      Implementation notes: no seeded role (Tester/Contributor/Project
      Admin) lacks all seven flags simultaneously, so the test creates a
      dedicated custom role via `POST /api/v1/roles` (roles are fully
      custom and instance-wide per add-project-rbac design.md D10). One
      real-browser scenario walks all six pages/components in sequence —
      deliberately not a re-enumeration of every gated control (already
      exhaustive at the unit level from tasks.md group 2), just proof the
      retrofit holds together end-to-end. `RunItemDetailPage` itself was
      out of the final walk (its `Assign to…` lives inside the same
      per-row `RowActionMenu` pattern verified on `RunPage`) to keep the
      scenario's runtime reasonable — the pattern, not the page, is what's
      being proven.
- [x] 15.3 Add an E2E (or component-level, if faster and equally
      trustworthy) regression check for the loading-race fix (design.md
      D2): a signed-in member refreshing a private project's URL directly
      never sees a "not found" flash before the real content renders.
      Implementation notes: component-level, in `ProjectPage.test.tsx` —
      resolves `/api/v1/users/me` after a delay and asserts "Project not
      found" never appears during the wait, then the real heading renders
      once auth resolves. Passed immediately (regression-proving, not
      new-behavior TDD — the fix already shipped in task group 10).
- [x] 15.4 Run the full suite against a rebuilt local compose stack
      (`make e2e` or equivalent manual rebuild) and confirm green before
      considering this change complete.
      Found and fixed a real gap in `anonymousPage()` (the E2E helper):
      Playwright's global `storageState` (the admin session, set in
      `playwright.config.ts`) applies to `browser.newContext()` too, so
      every "anonymous" context silently carried the real admin cookie —
      invisible before because the retired `/public/{key}` page never
      checked `useAuth()` at all; the new unified page correctly does,
      which exposed it. Fixed by passing an explicit empty
      `storageState: { cookies: [], origins: [] }`. Also fixed two bugs in
      the new 15.1 assertions themselves: an unscoped "Log in" locator hit
      a strict-mode violation once the not-found state's own login link
      (D3) coexists with `Layout`'s header login link (task 1); and the
      "multiple public projects" scenario asserted on the project *key*
      where the card's accessible name is the project *name*. All 13
      tests in `public-project-access.spec.ts` pass cleanly
      (`--workers=1`, isolated). Separately confirmed two *pre-existing*,
      unrelated flaky races (a fire-and-forget verdict-record POST and an
      instance-settings PATCH, both racing an immediate `page.goto()`
      with no await) via isolated reproduction and `git blame` showing
      they predate this change (`e40d78f`) — not fixed here, out of scope.
      QA/security pass (2026-08-11) surfaced D11's non-member 403 gap —
      see §16.

## 16. Fix: signed-in non-members must read public projects like anonymous visitors (design.md D11)

Found during a post-implementation QA/security review, after §1–15 above
had already shipped and gone green: `GET /api/v1/projects/{projectKey}`
requires `PermRead`, so a signed-in user who isn't a project member gets
403 on a page that branches on `user` alone — worse than what an
anonymous visitor to the identical public-project URL sees. Verified live
against the running stack (curl, non-member session vs anonymous): 403 vs
200 on the same resource. Not caught by any existing test — the
permission-gating retrofit (§2) only covers *members* with a restrictive
role (a `ProjectMembers` row exists), not a complete non-member (no row,
`EffectivePermissions` errors).

- [x] 16.1 Write a failing test for `useProjectReadAccess` (new export in
      `useProjectPermissions.ts`, design.md D11): resolves `'loading'`
      while `authLoading` or `projectKey` is absent; resolves `'public'`
      immediately for `!user`, with no fetch; resolves `'member'` when
      `GET /api/v1/projects/{projectKey}/permissions` succeeds; resolves
      `'public'` when it 403s, 404s, or errors. Confirm it fails.
      Implement. Make it pass.
- [x] 16.2 `SuiteDetailPage` — write a failing test: a signed-in user with
      no membership on a public project sees the same suite detail an
      anonymous visitor sees (not "not found"). Confirm it fails. Wire
      `useProjectReadAccess` into the branch condition and the fetch
      effect's loading guard, replacing `user`/`!authLoading` for that
      purpose only (chrome/login-link logic elsewhere keeps using
      `user`/`authLoading` unchanged). Make it pass. Verify existing
      authenticated- and anonymous-mode tests for this page still pass
      unmodified.
- [x] 16.3 `CaseDetailPage` — same fix, same test shape (including its
      `VersionDetailDialog.tsx` satellite fetch from task 4.1). Verify
      existing tests unmodified.
- [x] 16.4 `RunItemDetailPage` — same fix, same test shape (including its
      project-name breadcrumb satellite fetch from task 5.1). Verify
      existing tests unmodified.
- [x] 16.5 `RunPage` — same fix, same test shape (including its
      breadcrumb project-name and suite-name satellite fetches from task
      6.1). Verify existing tests unmodified.
- [x] 16.6 `SuitesPage` — same fix, same test shape. Verify existing tests
      unmodified.
- [x] 16.7 `RunsPage` — same fix, same test shape. Verify existing tests
      unmodified.
- [x] 16.8 `FolderExplorerPage` — same fix, same test shape. Verify
      existing tests unmodified.
- [x] 16.9 `ProjectPage` — same fix, same test shape, including
      `useProjectLanding`'s `user`/`authLoading` parameters (D11 changes
      what the *page* passes as its branch signal; `useProjectLanding`
      itself can keep taking an explicit boolean — rename the parameter's
      meaning at the call site, implementer's judgment on the cleanest
      signature). Verify existing tests unmodified.
- [x] 16.10 Re-run the full web unit suite, typecheck, and lint; re-run
      `apps/web/e2e/public-project-access.spec.ts` and confirm still
      green; re-run `make e2e` for final confirmation.
      All green: 939/939 web unit tests, `tsc --noEmit` clean, `oxlint`
      clean (pre-existing warnings only, none in touched files). Full
      `make e2e`: all 13 `public-project-access.spec.ts` tests pass; 3
      unrelated failures remain in `run-item-attachments.spec.ts` /
      `test-execution.spec.ts` / `ui-navigation.spec.ts`'s flaky-filter
      test — the same pre-existing "click, then navigate before the
      click's own effect completes" race class identified during 15.4
      (predates this change, `e40d78f`), now also caught in two more
      spots. Not fixed here — out of scope, worth a dedicated follow-up
      issue given it now spans 3+ files.

- [x] 16.11 Reinforced test coverage after a second QA/security pass
      (2026-08-11) on the D11 fix itself: (a) added
      `Requirement: A signed-in non-member reads a public project exactly
      like an anonymous visitor` to `public-project-access.spec.ts` — a
      real second user via `POST /api/v1/auth/login` with zero
      `ProjectMembers` rows (not a restrictive role, an outright
      non-member), proving the fix against the real compose stack rather
      than only mocked unit tests; (b) added explicit
      `GET /api/v1/users` non-call assertions to `CaseDetailPage.test.tsx`
      and `RunItemDetailPage.test.tsx`'s non-member tests, re-confirming
      D10 (no identity lookup) holds for the non-member case exactly as
      it already did for anonymous; (c) added a
      `ProjectPage.test.tsx` case proving the fallback's failure mode —
      a signed-in non-member on a project that is genuinely private still
      sees "not found", not silently granted access. All pass; full web
      suite (940 tests) and the full `public-project-access.spec.ts` (14
      tests) confirmed green against the live stack.
