## 1. Backend: role deletion-preview endpoint (TDD)

- [x] 1.1 Write a failing store test: a new `RoleRepo` method returning a role's
      reference counts — direct user assignments (`project_members` rows referencing
      the role), team assignments (`project_team_roles` rows referencing the role), and
      the count of distinct projects either touches (`UNION` of both tables' project_id
      for that role). Confirm it fails, then passes.
      `TestRoleReferenceCounts`.
- [x] 1.2 Write a failing service test: `Service.RoleDeletionPreview(ctx, roleID)
      (domain.RoleDeletionPreview{DirectUserCount, TeamCount, ProjectCount}, error)`.
      Confirm it fails, then passes.
      `TestRoleDeletionPreview`, `TestNonTenantAdminCannotViewRoleDeletionPreview`.
      Gated the same way sibling role-management methods already are (actor.IsTenantAdmin
      checked inside the service method, not just at the route).
- [x] 1.3 Write a failing HTTP scenario test: `GET
      /api/v1/roles/{roleId}/deletion-preview`, Tenant-Admin-gated (`requireTenantAdmin`,
      matching the rest of role management), returns the three counts as JSON; a
      non-Tenant-Admin caller is rejected. Confirm it fails, then passes.
      `TestScenario_RoleDeletionPreviewOverHTTP`,
      `TestScenario_NonTenantAdminCannotViewRoleDeletionPreviewOverHTTP`.
- [x] 1.4 `openapi.yaml`: add the path and a `RoleDeletionPreview` schema. `make
      generate`; confirm no drift.
- [x] 1.5 Full `go build`, `go vet`, `go test ./...`, `golangci-lint` — confirm green.

## 2. Shared AdminShell component + tab strip (TDD)

- [x] 2.1 Write a failing test for a new `apps/web/src/components/AdminShell.tsx`:
      renders a People/Roles/Instance tab strip (`NavLink`s to `/settings/people`,
      `/settings/roles`, `/settings/instance`) plus its `children`; the tab matching the
      current route has the active styling (`aria-selected`/matching class). Confirm it
      fails, then passes.
      Implementation notes: used `Link` + `useLocation()` (exact pathname match)
      instead of `NavLink`, since `NavLink`'s per-item render props don't extend to
      arbitrary attributes like `aria-selected`. `AdminShell.test.tsx`, 3 tests.
- [x] 2.2 Wire `PeoplePage.tsx`, `RolesPage.tsx`, `InstanceSettingsPage.tsx` to render
      inside `<AdminShell>`, dropping their own `<Breadcrumbs>` call (now redundant —
      the active tab already states where you are). Update each page's existing test
      file for the changed top-of-page structure. Confirm each page's suite is green
      after the change, not just not-red.
      No test file needed updating — none asserted on `Breadcrumbs` specifically, and
      each page's tests already provided a Router context (`Breadcrumbs` itself used
      `Link`).
- [x] 2.3 `AdminShell.test.tsx` plus updated `PeoplePage.test.tsx`/`RolesPage.test.tsx`/
      `InstanceSettingsPage.test.tsx` all green.
      Full web suite: 951/952 (the one failure is the pre-existing
      `ProjectPage.test.tsx` flake, confirmed unrelated). `tsc -b` and `oxlint` clean.

## 3. AdminMenu becomes a direct link (TDD)

- [x] 3.1 Write a failing test: `AdminMenu` (or its replacement) renders a single link
      to `/settings/people`, not a dropdown menu — no `aria-haspopup`, no open/close
      state, no outside-click/`Escape` handling. Confirm it fails against the current
      dropdown implementation.
- [x] 3.2 Rewrite `apps/web/src/components/AdminMenu.tsx`: `<Link to="/settings/people">`
      with the existing `ShieldIcon` + "Admin" label and hover treatment, plus an
      active/current style when already inside `/settings/{people,roles,instance}`.
      Delete the now-unused dropdown state/handlers.
- [x] 3.3 Rewrite `AdminMenu.test.tsx` for the new, much smaller surface — this is an
      intentional shrink of the component's responsibility, not a regression to
      preserve dropdown-shaped assertions for. Confirm green.
      3 tests. `Layout.test.tsx` (which renders `AdminMenu`) still green.

## 4. Instance Settings: labeled sections (TDD)

- [x] 4.1 Write a failing test: `InstanceSettingsPage` renders an "Access" section
      label above the existing public-access toggle Card (was previously unlabeled).
      Confirm it fails, then passes.
- [x] 4.2 Write a failing test: an "Authentication" section renders below it, containing
      a disabled "Require SSO sign-in" row with a "Coming with SSO (v0.2)" pill —
      reusing `ProfilePage.tsx`'s existing "coming soon" row idiom (muted icon chip,
      `opacity-60` row, pill badge). Confirm it fails, then passes.
- [x] 4.3 `InstanceSettingsPage.test.tsx` green; visually matches the mock's section
      shape (icon + uppercase label above each Card).
      5/5 tests green. Also added a page `<h1>` (was missing) — folds task 8.1's
      Instance half in early since it's the same file/section.

## 5. Roles: real deletion-preview counts in the delete dialog (TDD)

- [x] 5.1 Write a failing test: opening the delete-role dialog immediately shows the
      role name and a loading state (spinner in place of counts), then loads real
      counts from `GET /api/v1/roles/{roleId}/deletion-preview` and updates the
      description to "Deleting '{name}' — currently assigned to N users and M teams,
      across P projects. Deleting it removes those assignments too. This cannot be
      undone."; Confirm (destructive) is disabled until the counts resolve — same
      opens-instantly/loads-async/disabled-until-loaded pattern
      `PeoplePage.tsx`'s user-deletion dialog already uses. Confirm it fails, then
      passes.
      Used a manually-controlled deferred promise (same technique as
      `PeoplePage.test.tsx`'s equivalent test) to make the loading window
      observable against a mock that would otherwise resolve too fast.
- [x] 5.2 `RolesPage.test.tsx` green.
      19/19, including all pre-existing delete-role tests unmodified.

## 6. PeoplePage: discoverability + name/email + Access pill (TDD)

- [x] 6.1 Write a failing test: the Deactivate icon button on an active user's row is
      visible without hovering/focusing the row (no `opacity-0`). Confirm it fails
      against the current hover-only implementation, then passes. Add a `title`
      attribute mirroring the existing `aria-label`.
- [x] 6.2 Write a failing test: a user row with a `displayName` different from their
      `email` shows the display name (bold) with the email demoted to a smaller, muted
      second line; a user with no display name (or one equal to their email) still
      shows just the email, unchanged from today. Confirm it fails, then passes.
- [x] 6.3 Write a failing test: "Tenant Admin" renders as a small pill
      (`bg-primary/10 text-primary`); "Member" stays plain text. Confirm it fails, then
      passes.
- [x] 6.4 Replace the hand-rolled inline `<svg>` `PowerIcon` with `lucide-react`'s own
      `PowerIcon` import — no behavior change, confirm the existing deactivate tests
      still pass unmodified.
- [x] 6.5 `PeoplePage.test.tsx` full suite green.
      33/33. `tsc -b` clean.

## 7. TokensPage: revoke confirmation + revoked-token display (TDD)

- [x] 7.1 Write a failing test: clicking Revoke opens a confirmation dialog (`Revoke
      "{name}"?` / "Any CI/agent using it immediately loses access. This cannot be
      undone." / Cancel · Revoke) instead of calling the API immediately; cancelling
      does not call `DELETE`. Confirm it fails, then passes.
- [x] 7.2 Write a failing test: confirming the dialog calls `DELETE
      /api/v1/tokens/{tokenId}` and closes it. Confirm it fails, then passes.
- [x] 7.3 Write a failing test: a token with `revokedAt` set shows a status dot +
      "Revoked" (muted, matching `PeoplePage.tsx`'s Active/Deactivated status-cell
      idiom) instead of a Revoke button. Confirm it fails, then passes.
- [x] 7.4 Replace the hardcoded `border-amber-500` on the "copy this token now" warning
      with `border-secondary` (this app's actual warn semantic token) — visual only, no
      test needed beyond confirming the suite stays green.
- [x] 7.5 `TokensPage.test.tsx` full suite green.
      12/12, including the pre-existing "revokes a token" test rewritten for the
      new confirmation-dialog flow.

## 8. Low-priority consistency polish

- [x] 8.1 Add a real `<h1 className="tp-heading text-xl">` to `RolesPage.tsx`
      ("Roles") and `InstanceSettingsPage.tsx` ("Instance"), matching
      `PeoplePage.tsx`/`TokensPage.tsx`.
      Instance's `<h1>` was already added in task group 4 (same file/section).
- [x] 8.2 `RolesPage.tsx`: "New role" button → "+ New role", matching "+ New
      user"/"+ New token"/"+ New team" elsewhere. Update any test asserting the old
      label text.
      No test needed updating — existing assertions use `/new role/i` (unanchored),
      still matches "+ New role".
- [x] 8.3 `RolesPage.tsx`: drop the redundant outer `Card` wrapper around the whole
      roster; promote the heading+buttons to a plain `flex items-center
      justify-between` row, matching People's/Tokens' bare-list shape. Update any test
      asserting on the removed wrapper structure.
- [x] 8.4 Confirm `RolesPage.test.tsx` green after 8.1-8.3.
      19/19. `tsc -b` clean.

## 9. Docs

- [x] 9.1 `docs/design-system.md`: document the tab-strip pattern (filled-panel active
      state, when to use it) as a reusable idiom, alongside the existing sidebar-section
      finding it's modeled on.
- [x] 9.2 `docs/test-management.md` or wherever admin navigation is currently described:
      update to describe the persistent People/Roles/Instance tab shell replacing the
      old dropdown-only navigation, and that Tokens stays separate (personal, reached
      via Profile).
      Also fixed a pre-existing inaccuracy found while editing this exact paragraph:
      it referenced a nonexistent `/settings/teams` route — teams are actually managed
      on the People page (`/settings/people`), confirmed against `App.tsx`'s real
      routes.
- [x] 9.3 `docs/api.md`: document the new `GET /api/v1/roles/{roleId}/deletion-preview`
      endpoint.

## 10. Sample Project showcase (CLAUDE.md standing rule)

- [x] 10.1 Evaluate: this is a navigation/presentation change to instance-level admin
      pages, not project content — likely exempt as "purely internal, no new
      user-visible *capability*" the way a new domain feature would need showcasing,
      but the redesigned pages themselves ARE the user-visible surface. Confirm with
      the user whether anything in `sampledata/seed.go` needs adjusting (e.g. a role
      with real team+project assignments so the new Roles deletion-preview counts show
      non-zero numbers in the Sample Project's own Roles page) or whether existing seed
      data already covers it — don't silently skip without checking.
      Verified directly (not assumed): `seed.go`'s existing `SetProjectMember` calls
      already assign the seeded "Tester" role to two real users (Julia, Sam) on the
      Sample Project. Opening the Roles page's delete-role dialog for "Tester" already
      shows a real, non-zero example ("2 users and 0 teams, across 1 project") with no
      seed.go change needed — the showcase requirement is already met by existing
      data.

## 11. End-to-end verification

- [x] 11.1 Full web unit suite (`vitest run`), `tsc -b`, `oxlint`, `make coverage-web`
      (≥80% all metrics).
      962/962 (the earlier per-run flakes — `RunItemDetailPage.test.tsx`,
      `RunPage.test.tsx` — are the same pre-existing parallel-worker
      test-isolation pattern documented earlier this session; each passes
      reliably in isolation and neither file was touched by this change).
      Coverage: 92.13% statements, 84.47% branches, 89.14% functions, 94.52%
      lines. `tsc -b` and `oxlint` clean.
- [x] 11.2 Full Go suite (`go test ./...`), `go vet`, `golangci-lint`, `make
      coverage-api` (≥80%).
      All green, 0 lint issues, 81.6% coverage.
- [x] 11.3 `openspec validate redesign-admin-shell --strict` passes.
- [x] 11.4 Clean `docker compose down -v` + rebuild; live visual sign-off (Playwright/
      Chromium or manual) covering: tab strip navigation between all three pages,
      Instance's new sections, Roles' real-count delete dialog, People's discoverable
      Deactivate + name/email/pill treatment, Tokens' revoke confirmation + revoked
      display — user approval required before commit (standing rule).
      Rebuilt and walked through live via Chrome automation: tab strip navigates
      correctly across People/Roles/Instance with correct active styling; People
      shows the Access pill, two-line name/email, and always-visible
      Deactivate/Reactivate·Delete; Roles' delete dialog loads and shows real
      counts ("Currently assigned to 38 users and 0 teams, across 37 projects");
      Instance shows the Access/Authentication sections with the disabled
      SSO-coming-soon row; Tokens (deliberately outside the tab shell) shows the
      new Revoke confirmation dialog. All matched the mock exactly. User's own
      live sign-off still pending before commit.
