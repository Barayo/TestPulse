# Tasks: Redesign UI

Supersedes the first implementation pass in full (rejected on visual/IA review — see
`design.md`'s Context). TDD throughout: write the failing test first, then the minimal
change to pass. Structural/copy changes to existing tests are made in the same commit as
the code that requires them, never deferred.

## 0. Remove the rejected first pass

- [x] 0.1 Remove `ProjectSidebar` and its test — the always-visible sidebar is replaced by
      the project switcher (task 3). Keep `DataRevisionProvider`/`useActiveProjectId` —
      still needed infrastructure, unrelated to the sidebar-vs-switcher decision.
- [x] 0.2 Remove the Corona palette tokens and `.tp-heading`/`.tp-label` utilities from
      `src/index.css` — replaced in task 1.

## 1. Design tokens

- [x] 1.1 Replace tokens in `src/index.css` (`:root` and `.dark`) with the teal palette
      (design.md D1) — `background`, `surface`, `border`/`border-strong`, `ink`,
      `muted`/`faint`, `primary`/`primary-dark`, `warn`, `fail`. Typography utilities
      (`.tp-heading`/`.tp-label`, Geist Sans/Mono) carry over unchanged from the first
      pass — re-add if removed in 0.2, no new font loads.

## 2. Seed data (dev-only)

- [x] 2.1 `make seed-demo` target + seed script, calling the API/service layer directly
      (never touching a real deployment). Populates two example projects per design.md D10:
      Banca Móvil (7 suites, nested folders including one 32-case folder, mixed
      pass/fail/skip run history) and Desktop App (3 folders, no suites, no runs yet).
      Documented in `docs/development.md`.

## 3. Project switcher (test-first)

- [x] 3.1 `ProjectSwitcher` component: compact header trigger showing the active project
      name; opens a searchable palette listing all projects with suite/case counts and
      latest pass rate. Keyboard shortcut opens the same palette from any page. Pure
      props-in for the project list; data fetching wired in the shell.
- [x] 3.2 Wire into `App.tsx`'s header, replacing the removed sidebar's project-switching
      role. `useActiveProjectId` (kept from the first pass) continues resolving the active
      project from the route.

## 4. Project landing (test-first)

- [x] 4.1 Three landing panel components — Carpetas, Suites, Runs recientes — each: top-N
      rows, "ver todas" link, own empty state (design.md D4). Case/suite counts computed
      from already-fetched project data, no new endpoints. Runs recientes rows show a small
      health bar next to the pass-rate number (teal ≥80%, amber 50-79%, coral <50%), not
      the number alone — factor the color-by-rate mapping into a shared helper, since the
      same three-way split will be reused whenever the deferred execution-history donut
      (design.md D7) is eventually built. Carpetas and Suites rows stay plain counts — no
      per-suite pass rate, since `Run` doesn't persist which suite it came from
      (design.md D4 correction, issue #11).
- [x] 4.2 `ProjectPage` renders the three panels as the landing; verify against both seed
      projects (dense Banca Móvil, empty-ish Desktop App) manually before considering done.
- [x] 4.3 `SuitesPage` (`/projects/:projectId/suites`, reached from "ver las N ›" on the
      Suites panel): full suite list, create-suite form, per-suite case membership
      add/remove — carried over from the old `ProjectPage`'s suite section, just given its
      own route instead of living on the landing. *Gap found while wiring the landing*: the
      original task breakdown covered folders in depth but dropped where suite creation and
      the "ver todas" destination for Suites live — this task closes that.
- [x] 4.4 `RunsPage` (`/projects/:projectId/runs`, reached from "ver todos ›" on the Runs
      recientes panel): full run list + create-run form, same "carried over, given its own
      route" treatment as 4.3.

## 5. Folder explorer (test-first)

- [x] 5.1 Tree navigation component: folders only, real nesting (expand/collapse), no depth
      limit. Selecting a node updates the selected folder.
- [x] 5.2 Content list component: selected folder's direct subfolders and cases (distinct
      icons), case rows show version + suite-membership pills (suite membership computed
      client-side from `Suite.caseIds`, already fetched for the Suites landing panel — no
      new endpoint).
- [x] 5.3 Breadcrumb extension: reflects folder depth when browsing (design.md D5,
      `ui-navigation` spec "Breadcrumb reflects folder depth").

## 6. Creating folders and cases (test-first)

- [x] 6.1 Inline folder creation: triggered from the open folder's toolbar, or from a
      right-click "Nueva subcarpeta" on any tree node without navigating into it. No
      parent-picker field anywhere — parent is implicit from the trigger site
      (design.md D6).
- [x] 6.2 `CaseDrawer` create mode: right-docked drawer, title field, steps list where each
      step has an Acción input (required) and a Resultado esperado input (optional),
      mapping directly to the existing `Step{action, expected}` schema. `POST` on submit.

## 7. Viewing and editing a case (test-first)

- [x] 7.1 `CaseDrawer` view mode: read-only steps, version pill, suite-membership pills,
      and a version-history section backed by `GET /cases/{caseId}/versions` (existing
      endpoint), current version highlighted. Do **not** build an execution-history
      section in this task — it depends on a query that doesn't exist yet
      (design.md D7, tracked as issue #11); revisit only once that ships.
- [x] 7.2 `CaseDrawer` edit mode: reuses the create-mode step editor pre-filled with current
      content; saving calls `PUT /cases/{caseId}` (existing endpoint, creates a new
      version) and refreshes the version-history section.

## 8. `/projects` page (test-first)

- [x] 8.1 Project list (name, suite/case counts, pass rate) with "+ Nuevo proyecto" in its
      own header row, never inline in the list. Empty state with its own, separately
      positioned call to action. No role gating yet (v0.1 has no real roles) — both
      elements always render, but structurally isolated per design.md D9 for
      `add-project-rbac` to gate later without a layout change.

## 9. Status badges

- [x] 9.1 Remap the shared status-badge mapping (kept from the first pass's D4/D8) to the
      new tokens: `pass` → `primary`, `fail`/`blocked` → `fail`, `skipped` → `warn` at
      reduced weight, `pending`/`retest` → neutral. Applied on `RunPage` item chips — no
      structural change to the run execution board itself.

## 10. E2E

- [x] 10.1 Rewrite `e2e/ui-navigation.spec.ts` to cover every `ui-navigation` requirement in
      the rewritten spec: switcher (header + keyboard), landing panels (dense + empty),
      folder navigation and breadcrumb depth, folder creation (both entry points), case
      creation with steps, case viewing (steps, suite pills, version history), case editing
      (version bump), and the `/projects` list + empty state. *Gap found while starting this
      task*: `e2e/test-authoring.spec.ts` and `e2e/test-execution.spec.ts` (from
      `add-core-domain`, not this change) drive the *old* UI directly — flat project-button
      navigation, an always-visible "New folder name" input and case-creation form on the
      project page, "(N cases)" suite-membership text. Their domain requirements are
      unchanged, but every one of those selectors breaks against the new UI. Updated their
      interaction steps to the new flow (folder explorer + `CaseDrawer` for case/folder
      creation, `SuitesPage` for suite membership) in this same task — same principle as
      CLAUDE.md's "structural/copy changes to existing tests happen in the same change."
      Dropped one prior scenario ("Folder name is required") that was UI-only coverage never
      mapped to a spec.md scenario — the new inline row no-ops on an empty name instead of
      showing an error, a deliberate lower-stakes UX for that control.

      **Real bugs found and fixed while running this against the actual compose stack**
      (not just component-level mocks):
      - `CaseDrawer`: saving an edit never left edit mode (`isEditing` was never reset),
        so the version-history section stayed hidden after every save. Fixed in
        `submitEdit`; regression test added to `CaseDrawer.test.tsx`.
      - `CaseDrawer`: the drawer's "✕" dismiss icon and its footer "Close" button both had
        the accessible name "Close", making them unselectable by name. Renamed the icon to
        "Dismiss".
      - `RunsPage`: "Create run" read `cases` from state before its own initial fetch
        resolved, so a fast submit created a run with 0 items — a real race, not just a
        fast-test artifact, reintroduced by splitting run creation onto its own page (the
        old single-page flow incidentally serialized case-creation's `load()` ahead of it).
        Fixed with a `loaded` guard disabling "Create run" until the initial fetch settles;
        regression test added to `RunsPage.test.tsx`.
      - `FolderExplorerPage`: `activeCase.content.steps` (API type, `expected` optional)
        didn't satisfy `CaseDrawer`'s `Step` type (`expected` required) — caught only by the
        Docker build's `tsc -b`, not the faster `tsc --noEmit` used during development.
        Normalized at the prop boundary.
      - Test-only: `FolderExplorerPage`'s content list needed an accessible name
        (`aria-label="Folder contents"` on the `<ul>`) so E2E could disambiguate a folder
        row from the same name shown in the tree.
- [x] 10.2 Run against `make seed-demo` data at least once during development, not only
      against minimal test fixtures, to catch density issues the way the brainstorming
      phase did. Verified interactively against Banca Móvil: 3-level nesting
      (Transferencias → SEPA → Validación IBAN/Recurrentes) navigates and breadcrumbs
      correctly; the 33-case Transferencias and 18-case Pagos con tarjeta folders both
      stay legible as a single scrollable list (the two-pane design's actual point);
      the case drawer renders real steps, suite pills, and version history correctly.

## 11. Docs and verification

- [x] 11.1 Update `docs/test-management.md` ("finding your way around" section reflecting
      the switcher/landing/explorer, not the sidebar) and `docs/architecture.md`
      (design-system summary: palette tokens, `ProjectSwitcher`/`FolderExplorer`/
      `CaseDrawer`). Document `make seed-demo` in `docs/development.md` (task 2.1).
- [x] 11.2 Full verification sweep, all green:
      - `make coverage-web`: 93.16% / 80.05% / 94.88% / 97.02% (statements/branches/
        functions/lines) — branch coverage needed real new tests (not a lowered
        threshold) for edge cases TDD alone hadn't hit yet: API-failure recovery paths
        on `ProjectPage`/`SuitesPage`/`RunsPage`, multi-level folder case counting,
        run-list sort order, the switcher's actual navigate-on-select, and a few
        never-clicked buttons (`CaseDrawer`'s edit-cancel, the folder tree's
        click-outside-closes-menu, Escape on the inline new-folder row).
      - `make coverage-api`: 86.8% (needs `make test-db-up` — integration tests are
        skipped without `TESTPULSE_TEST_DATABASE_URL`, dropping this to ~18% otherwise;
        not a regression, just the existing gate needing its documented precondition).
      - `make lint`: 0 Go issues; web clean (pre-existing tolerated warnings only).
      - `npx tsc -b --force`: clean. Caught the one real type bug in this change (D.1
        under 10.1) that `tsc --noEmit` alone missed during development.
      - `make generate`: no OpenAPI contract drift.
      - `make e2e`: 32/32, full compose rebuild.
      Visual read is the project owner's own review against `make seed-demo` data —
      not claimed complete here, and this change is not committed/pushed/archived
      until that review happens (standing instruction).

## 12. Post-completion corrections from visual review

Found during the owner's own visual review (task 11.2's pending item), each fixed with
TDD and a full re-verification sweep (unit tests, `tsc -b --force`, lint, `make e2e`) —
see design.md D11 for the full rationale on each.

- [x] 12.1 Fixed a real N+1 request-storm bug: `useProjectSummaries`/`useProjectLanding`
      fired 3-4 uncancelled HTTP requests per project with no concurrency cap, which
      saturated the browser's connection pool once real project counts grew (reproduced
      with 183 accumulated dev-DB projects — 900+ simultaneous requests) and caused
      reported empty landing panels after client-side navigation. Fixed with
      `AbortController` cancellation on unmount/dep-change plus a 4-way concurrency pool.
      The real scalable fix (server-side aggregation) is tracked separately as
      `add-project-stats-endpoint` — out of scope here since it needs backend changes.
- [x] 12.2 Made each landing panel's entire header (not just "see all") clickable to the
      same destination, and made every Suites/Runs row a direct link (suite rows open a
      `SuiteDrawer` deep link; run rows go straight to `/runs/{id}`) — previously only
      Folders/Library rows were clickable, per user feedback that a visible list item
      that isn't clickable is worse than not showing the list at all.
- [x] 12.3 Replaced `SuitesPage`'s fully-expanded inline membership list with a clean
      name+case-count list and a `SuiteDrawer` (see design.md D11).
- [x] 12.4 Renamed "Folder" to "Section" and labeled the root "Library" across all
      user-facing copy, aria-labels, and routes (see design.md D11). Updated
      `docs/test-management.md` and `docs/architecture.md` in the same task.
