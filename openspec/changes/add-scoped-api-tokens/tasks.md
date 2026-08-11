## 1. Data model and migration

- [x] 1.1 Write a failing store-level test asserting `ApiTokenRepo.Create`
      accepts an optional `projectID *string`/`roleID *string`, persisting
      them; a token created without them has both `nil` (design.md D1's
      "unscoped" sentinel). Confirm it fails. Add migration
      `ALTER TABLE api_tokens ADD COLUMN project_id uuid REFERENCES
      projects(id) ON DELETE CASCADE, ADD COLUMN role_id uuid REFERENCES
      roles(id) ON DELETE CASCADE, ADD CONSTRAINT api_tokens_scope_check
      CHECK ((project_id IS NULL) = (role_id IS NULL))`, plus
      `INSERT INTO roles (...) VALUES ('Viewer', 0, true, false, ...,
      false)` (D2 — read-only, rank below Tester's 1). Update
      `domain.ApiToken` (`ProjectID *string`, `RoleID *string`) and
      `ApiTokenRepo.Create`/`Get`/`GetByHash`/`ListByCreator` to
      read/write the new columns. Make it pass.
- [x] 1.2 Write a failing test asserting deleting a role a token is scoped
      to deletes the token itself (`ON DELETE CASCADE`, mirrors
      `TestEffectivePermissionsLostWhenRoleDeleted`'s existing pattern for
      `project_members` — same assertion shape, applied to
      `api_tokens`). Confirm it fails, then passes.
- [x] 1.3 Write a failing test asserting an existing (pre-migration-shaped)
      token row — `project_id`/`role_id` both `NULL` — round-trips as such
      with no error. Confirm it fails, then passes — proves the "no
      backfill needed" claim in design.md's Migration Plan isn't just
      asserted, it's verified.
      Implementation notes: covered by `TestApiTokenCreateGetByHashAndRevoke`'s
      existing assertion (extended in 1.1) that an unscoped token's
      `ProjectID`/`RoleID` are both nil — no separate test needed, this
      IS that round-trip. Migration `00013_scoped_api_tokens.sql` adds
      `project_id`/`role_id` (both nullable, `CHECK` constraint) plus the
      seeded `Viewer` role. All verified via a full `go test ./...` pass
      (all packages green) after the migration, confirming no existing
      code broke against the new schema.

## 2. Token creation: validate scope against the creator's own access

- [x] 2.1 Write a failing test: `Service.CreateToken` accepts optional
      `projectID`/`roleID` params; when provided, validates (a) the role
      exists, (b) the creating actor currently holds `read` on that
      project, and (c) every permission flag the named role grants is
      already granted by the creator's own `EffectivePermissions` for that
      project (the same call `requirePermission` already uses) —
      rejecting with a validation error (`400`, matching this codebase's
      existing convention) if not. Confirm it fails. Implement. Make it
      pass.
      Implementation notes: used `Service.MyPermissions` (not bare
      `EffectivePermissions`) — it already applies the Tenant Admin
      bypass and turns "no membership" into an ordinary all-false result
      instead of an error, exactly the semantics creation-time validation
      needs. Added `Role.Permissions()` (converts a role's flags to a
      `Permissions` struct) and `Permissions.IsSubsetOf`/`.Intersect` to
      `domain.go`, each with their own unit tests, reused by task group 3
      too. No separate explicit "creator must hold read" check —
      subsumed by `IsSubsetOf` for any role that itself grants read
      (virtually all meaningful roles).
- [x] 2.2 Write a failing test: creating an unscoped token (no
      `projectID`/`roleID`) is completely unaffected by 2.1's validation —
      same behavior as before this change. Confirm it fails only if 2.1's
      implementation accidentally made scope-checking unconditional, then
      passes.
- [x] 2.3 Write a failing test: a Tenant Admin can scope a token to any
      project and any role (their own "current access" is universal, per
      the existing Tenant Admin bypass). Confirm it fails, then passes.
- [x] 2.4 Update `packages/shared/openapi.yaml`: token creation request
      gains optional `projectId`/`roleId` fields, matching naming
      conventions already used for `PUT
      /api/v1/projects/{projectKey}/members/{userID}`'s `roleId` payload.
      `make generate`.

## 3. Authorization: scoped-token request-time enforcement (design.md D3)

- [x] 3.1 Write a failing test: `domain.Actor` gains
      `ScopedProjectID *string` / `ScopedPermissions *Permissions` (both
      nil for human/unscoped-agent actors). `AuthenticateToken` populates
      them for a scoped token — `ScopedPermissions` is the *intersection*
      (see 3.2), not the raw role flags. Confirm it fails. Implement. Make
      it pass.
- [x] 3.2 Write a failing test: the intersection is computed at request
      time from a fresh role-flag lookup ANDed with a fresh
      `EffectivePermissions(creator, resolvedProjectID)` call — never a
      cached/stale value — so a later reduction in the creator's own role
      narrows the token too (mirrors the existing unscoped-inheritance
      staleness behavior, authorization spec's already-existing scenario).
      Confirm it fails. Implement. Make it pass.
      Implementation notes: `AuthenticateToken` runs once per request (the
      `authenticate` middleware) with no cross-request caching, so
      computing the intersection there already satisfies "request time" —
      no extra plumbing needed beyond what 3.1 already built.
      `TestScopedTokenNarrowsIfCreatorAccessNarrows` proves it explicitly
      (downgrades the creator's role between two `AuthenticateToken`
      calls on the same token).
- [x] 3.3 Write a failing test: a scoped actor's request against any
      project other than `ScopedProjectID` is rejected with `403`,
      regardless of what the creator can access there — checked before
      (or as part of) the permission-flag intersection, not after.
      Confirm it fails. Implement. Make it pass.
      Implementation notes: **critical finding during this task** — the
      naive implementation (just adding the scoped branch) would have let
      a Tenant-Admin-created scoped token bypass all scoping entirely,
      because `requirePermission` checks `actor.IsTenantAdmin` *first* and
      returns immediately. Fixed by forcing `IsTenantAdmin = false` on any
      scoped token's `Actor` in `AuthenticateToken`, regardless of the
      creator's real admin status — `ScopedPermissions` carries the real
      (correctly capped) authority instead. Covered explicitly by
      `TestScopedTokenFromTenantAdminIsNotTenantAdmin` (service-level) and
      `TestScenario_ScopedTokenFromTenantAdminDoesNotBypassScoping`
      (HTTP-level, full router+middleware chain) — this is the single
      most important test in the whole change.
- [x] 3.4 Write a failing test: an unscoped token's authorization is
      completely unaffected by 3.1-3.3 — full existing behavior,
      unchanged. Confirm it fails only if the new branch accidentally
      became unconditional, then passes.
      Covered by all pre-existing token/session/human-actor tests passing
      unmodified (verified in 3.6) plus `TestCreateTokenUnscopedUnaffectedByScopeValidation`.
- [x] 3.5 Write a failing test: a token whose scoped role has been deleted
      no longer authenticates at all (`401`, same as any other
      nonexistent/revoked token — 1.2 already proves the row itself is
      gone via cascade, this proves the HTTP-level consequence). Confirm
      it fails, then passes.
      `TestScenario_ScopedTokenDeletedWhenItsRoleIsDeleted` (HTTP-level).
- [x] 3.6 Run the full existing `authorization`/`authentication` test
      suites (`internal/server/project_rbac_api_test.go`,
      `internal/service/identity_test.go`, and this change's own new
      files) and confirm every pre-existing test still passes unmodified
      — this task's whole point is proving 3.1-3.5 didn't regress the
      untouched human-actor and unscoped-agent paths.
      Full `go test ./...` (all packages), `go vet ./...`, and
      `golangci-lint run ./...` all green/clean.

## 4. Frontend: scope picker and display

- [x] 4.1 Write a failing test: `TokensPage.tsx`'s creation form has a
      collapsed-by-default "Scope to a project (optional)" section;
      leaving it collapsed creates a token with no `projectId`/`roleId` in
      the request body (today's behavior, byte-for-byte). Confirm it
      fails. Implement. Make it pass.
- [x] 4.2 Write a failing test: expanding the scope section shows a
      project `<select>`, then (once a project is picked) a role
      `<select>` populated from `GET /api/v1/roles` — the same plain
      `<select>`-fed-from-the-roles-list pattern `ProjectMembersPage.tsx`
      already uses, not a new component. Picking both and submitting
      includes `projectId`/`roleId` in the creation request. Confirm it
      fails. Implement. Make it pass.
- [x] 4.3 Write a failing test: the token list shows "Full access" for an
      unscoped token and "{project name} · {role name}" (or similar,
      implementer's judgment on exact copy) for a scoped one. Confirm it
      fails. Implement. Make it pass.
      Implementation notes: also loads `GET /api/v1/projects` alongside
      tokens/roles (needed for both the picker and resolving IDs to names
      in the list display). `tsc`, `oxlint`, and the full web suite (945
      tests) all clean.

- [x] 5.1 Update `docs/api.md`'s token section: document the optional
      `projectId`/`roleId` creation fields, the validation rule (can't
      scope to a role more powerful than the creator's own current
      access), that scoping is request-time-enforced (narrows
      automatically if the creator's own access later narrows, and the
      token stops working entirely if its role is deleted) — not a
      one-time snapshot, and the new seeded `Viewer` role.
- [x] 5.2 Update wherever agent-token usage is documented for end users
      (check `docs/test-management.md` and any onboarding doc mentioning
      tokens) to mention scoping — and the `Viewer` role specifically for
      the common "read-only integration" case — as the recommended
      default for a single-purpose integration, full-access tokens as the
      broader-but-simpler option.
      Implementation notes: added a new "API tokens" section to
      `docs/test-management.md` (between "Project roles and teams" and
      "Public project access") covering creation location, one-time
      reveal, unscoped-by-default behavior, and the scoping flow
      (project+role picker, creation-time validation against the
      creator's own access, request-time re-intersection, cascade
      revocation on role deletion) with `Viewer` called out as the
      recommended default for single-purpose integrations. Also updated
      the seeded-roles table to include `Viewer`, and reworded the
      existing "API token always acts at creator's level" sentence to
      note the new scoped alternative with a link to the new section.

## 6. Sample Project showcase

- [x] 6.1 Per the standing rule: evaluate whether `seed.go` should create
      a scoped token (e.g. scoped to `Viewer`) demonstrating this
      capability. A created token's full value is only ever shown once at
      real-creation time (per the existing, unchanged "Create a token"
      scenario) — seed.go can still insert a token row with a scope
      directly (bypassing the one-time-reveal UX, since there's no real
      secret a demo needs to keep secret), so the Sample Project's token
      list shows a concrete scoped example alongside a full-access one.
      Implement if straightforward; otherwise document in this task why
      it was skipped, per the standing rule's "explicitly verified, not
      silently skipped" requirement.
      Implementation notes: `Seed` now creates two tokens attributed to
      the Tenant Admin — `ci-pipeline` (unscoped, full access, today's
      default) and `status-dashboard` (scoped to the Sample Project's
      seeded `Viewer` role) — right after the existing Tester
      project-membership setup, reusing the same `roles` slice already
      loaded there. Added
      `TestSeedContentShowcasesScopedApiToken` (RED-verified: temporarily
      reverted the `seed.go` change via `git stash`, confirmed the new
      test fails with the expected "no unscoped/scoped token seeded"
      messages, then restored the implementation and confirmed GREEN)
      asserting `ListOwnTokens` returns both an unscoped token and one
      scoped to the Sample Project.

## 7. End-to-end verification

- [x] 7.1 Add an E2E scenario (`apps/web/e2e/`, check for an existing
      token-management spec file first) covering: creating a token scoped
      to the seeded `Viewer` role via the UI, then a real HTTP request
      using that token's value succeeding on a read within its scope and
      failing (`403`) on a write — mirrors this codebase's established
      pattern of proving the contract via a real second actor, not just
      mocked unit tests (see `unify-authenticated-and-public-views`'s
      non-member E2E test for precedent).
      Implementation notes: no existing token-management spec file — added
      `apps/web/e2e/scoped-api-tokens.spec.ts` (TD-77), mirroring
      `project-rbac.spec.ts`'s real-second-actor pattern: creates a
      project via the UI, creates a token scoped to that project's
      `Viewer` role via `/settings/tokens`'s real creation form, then
      issues real `GET`/`PATCH` HTTP requests bearing the token to prove
      `200` on read and `403` on a `PermManageProject`-gated write. Passed
      on first run against the full compose stack (`docker compose ... up
      --build`, `npx playwright test e2e/scoped-api-tokens.spec.ts`).
- [x] 7.2 Run the full web unit suite, `tsc`, lint, full Go test suite,
      `golangci-lint`, and `make coverage-api`/`make coverage-web`;
      confirm all green before considering this change complete.
