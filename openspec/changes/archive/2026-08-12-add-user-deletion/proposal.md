## Why

A Tenant Admin can deactivate a user (revoking access immediately) but has no way to permanently remove the account afterward — deactivated users accumulate forever. This is the same maintenance/cleanup motivation as `add-data-retention` (runs, archived projects), extended to accounts: once someone is confirmed gone (deactivated) and an admin decides the record itself is no longer needed, there's currently no way to actually remove it.

## What Changes

- New: `DELETE /api/v1/users/{userId}` — permanently deletes a user account. Only available once the user is already deactivated (`deactivatedAt` set); an active user cannot be deleted this way — mirrors `add-data-retention`'s "archive, then separately delete" pattern for projects. Self-deletion is blocked, server-side (the existing self-deactivation guard is frontend-only today — a pre-existing gap; this change adds the real, server-side guard for deletion, and flags the deactivation gap as a related finding, see design.md Risks).
- Gated by Tenant Admin status alone, not a new project-scoped permission flag — `createUser`/`updateUser` (deactivate/reactivate/tenant-admin toggle) are already gated this way today (`requireTenantAdmin` route middleware, confirmed by reading `identity_handlers.go`), not through the project-scoped `roles` permission-flag catalog `add-project-rbac` D11 established. User deletion follows the same existing pattern rather than introducing a new, inconsistent gate.
- **BREAKING**: none for existing behavior — this only adds a new destructive capability that doesn't exist today.
- No automatic/age-based deletion — every deletion is a manual action, explicitly confirmed by the admin, naming the account and what it's connected to before anything happens (same confirmation-dialog pattern established across this session: Roles, Users deactivate, Team member remove).
- No anonymization, no GDPR/data-export tooling, no self-service account deletion — this is an admin cleanup capability (removing an account nobody needs a record of anymore), not a privacy/compliance feature. If privacy/compliance erasure is a real future need, that's a different, larger change (it would need to reconsider audit_log/test_run_results too, which this change deliberately leaves untouched).
- No change to the audit log or run-result actor records — both already store actor identity as free text, not a foreign key to `users`, so deleting a user's account row does not affect either (verified directly against the schema, not assumed).

## Capabilities

### New Capabilities
(none — this is a new requirement on an existing capability, not a new domain)

### Modified Capabilities
- `authorization`: documents that user deletion is gated by Tenant Admin status (not a project-scoped permission flag), and that it requires the target user to already be deactivated.

## Impact

- **Schema**: no new tables. A new incremental migration (`00014_cascade_user_deletion.sql`, per CLAUDE.md's migration policy — never edit a migration already on `main`) adds `ON DELETE CASCADE` to `sessions.user_id` and `api_tokens.created_by` — both currently plain `REFERENCES` with no `ON DELETE` clause, meaning a `DELETE FROM users` today would fail outright with a foreign-key violation for any user who has ever logged in or created a token (checked directly against the migration, not assumed). `team_members.user_id`, `project_members.user_id`, and `project_favorites.user_id` already cascade correctly.
- **API**: new `DELETE /api/v1/users/{userId}`, gated by `requireTenantAdmin` (same middleware already used for `POST /users` and `PATCH /users/{userId}`), with a 400 if the target isn't already deactivated and a 403 (or 400) if the caller targets their own account.
- **Service**: new `Service.DeleteUser(ctx, actor, userID)` — validates deactivated-first and not-self, then deletes; audited (`s.audit(ctx, "delete", "user", id)`).
- **UI**: a "Delete" action on a deactivated user's row in `apps/web/src/pages/PeoplePage.tsx` (only shown once deactivated, mirroring the reactivate/deactivate split already there), behind a confirmation dialog naming the account and showing real counts — teams, direct project memberships, and live API tokens — sourced from a single new `GET /api/v1/users/{userId}/deletion-preview` call (see design.md D5's revision: the original plan to compute the project count client-side turned out to require an N+1 fan-out with no reverse lookup available, so it's server-computed instead).
- **Audit log**: deletion is an audited write; the log itself is unaffected by what gets deleted, per the free-text-actor design confirmed above.
