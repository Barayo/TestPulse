## Why

As a project admin, when I look at who a run item is assigned to, I want that assignment to reference a real person or team, not an arbitrary string someone typed, so assignment is trustworthy, doesn't rely on consistent spelling, and (later) can gate who's allowed to record a result on it (#104). #100 shipped a full assignment UI on top of the pre-existing free-text `assignee` field, deliberately deferring this upgrade since it's the riskier half. Closes #103.

## What Changes

- **BREAKING, deliberately**: the pre-launch app has no published version yet, so this replaces the free-text `assignee` column outright rather than keeping it alongside a real link. `RunItem` gains `assigneeUserId`/`assigneeTeamId` — real foreign keys into `users`/`teams`, mutually exclusive, `ON DELETE SET NULL` so a deleted user/team simply reverts the item to unassigned rather than leaving a dangling reference. The old free-text `assignee` column is dropped; every currently-assigned item (in the live Sample Project and anywhere else) resets to unassigned.
- **Assignment can only be made to a real user or team.** The assign control (per-item, bulk, and default-assignee-at-creation) becomes a search-and-pick UI scoped to the project's actual membership (reusing `GET /projects/{projectKey}/members`), replacing the free-text field #100 shipped.
- The API's `RunItem.assignee` response field becomes a nullable `{ kind: 'user'|'team', id, name }` object (name resolved via join, not stored) instead of a bare string — the board/filter UI reads `assignee.name` where it previously read `assignee` directly, otherwise unchanged.
- No legacy-data preservation, no "unknown" fallback state, no backfill/reconciliation logic — the reset is the whole migration.

## Sequencing note

This was originally drafted with an additive, backward-compatible migration
(mirroring how `test_run_results.actor`/`actor_kind`/`actor_ref_id` preserves
history). Revised after explicit direction: since nothing has shipped a
published version yet, a clean breaking reset is preferred over carrying
legacy-display scaffolding for data that doesn't need preserving.

## Capabilities

### New Capabilities

(none — this modifies the existing `test-execution` assignment requirement)

### Modified Capabilities

- `test-execution`: the "Run item assignment" requirement changes from free-text assignment to a real user/team reference, with legacy free-text data preserved read-only.

## Impact

- **Migration**: `apps/api/internal/db/migrations/00005_*.sql` — `ALTER TABLE test_run_items DROP COLUMN assignee, ADD COLUMN assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL, ADD COLUMN assignee_team_id uuid REFERENCES teams(id) ON DELETE SET NULL`, plus a check constraint that at most one is set. A new file, not an edit to an existing one — consistent with the repo's migration policy even though its effect is destructive to existing `assignee` data.
- `apps/api/internal/domain/domain.go` — `RunItem.Assignee string` is replaced by `RunItem.AssigneeUserID`/`AssigneeTeamID *string`; the API-facing shape resolves these to a nullable `{kind, id, name}` object at the service/handler layer.
- `apps/api/internal/store/runs.go` — `AssignItem` becomes `AssignItemToUser`/`AssignItemToTeam`; the `Items` query gains joins to `users`/`teams` to resolve display names.
- `packages/shared/openapi.yaml` — `ItemStatusUpdate`'s `assignee: string` becomes `assigneeUserId`/`assigneeTeamId` (mutually exclusive, mirroring `ProjectMember.userId`/`ProjectTeamRole.teamId`'s existing split); `RunItem.assignee` becomes a nullable object. **BREAKING** on both the request and response shape for this field.
- `apps/web/src/components/AssignDialog.tsx` — becomes a project-scoped search-and-pick UI (reusing `UserPicker`'s search-dialog pattern, extended to also list teams) instead of a free-text field.
- `apps/web/src/lib/assignRunItems.ts`, `apps/web/src/pages/RunPage.tsx`, `apps/web/src/pages/RunItemDetailPage.tsx`, `apps/web/src/pages/NewRunPage.tsx` — updated call sites for the new assign contract and the new `assignee.name` read shape.
- `apps/api/internal/sampledata/seed.go` — the Sample Project currently has only one real user (the bootstrap admin); this change seeds one or two additional demo users (and optionally a team) so the picker and multiple real assignees have something to demonstrate, replacing the decorative free-text names ("Julia López", "Miguel Alonso") used for #100's seed data.
- `docs/test-management.md` — document that assignment now requires picking a real project member.
- Out of scope, still deferred: whether assigning needs its own permission flag (#104's own open question, unaffected by this change).
