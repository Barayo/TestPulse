## Context

`RunItem.Assignee` is now a real `{Kind: user|team, ID, Name, AvatarKey}`
reference (`domain.go:469-505`, shipped by #103), so an actor-vs-assignee
identity comparison is finally reliable. Today `requirePermission`
(`middleware.go:220-263`) is the only gate on the two status-changing
endpoints — `POST /items/{itemID}/results` → `RecordResult`
(`service.go:706`) and `PUT /items/{itemID}/status` → `UpdateItem`
(`service.go:752`) — and it only ever resolves a `projectID`, never an
`itemID`, so it has no way to know an item's assignee. The check has to live
in the service layer, next to the existing mutating calls.

`Project.PublicAccess` (`domain.go:279`, `00001_baseline.sql:111`,
`store/projects.go:231-234`, `ProjectSettingsPage.tsx:119-145`) is the
existing precedent for a project-level boolean toggle end-to-end and is
copied verbatim for the new setting.

## Goals / Non-Goals

**Goals:**
- A project admin can turn on a policy that confines who may record a
  result or change status on an already-assigned run item to that item's
  assignee (or a `manageProject` holder / Tenant Admin).
- The check uses the real authenticated actor only — the "record on behalf
  of" display-name override never participates in the decision.
- Team-assigned items: any member of the assigned team satisfies the check.

**Non-Goals:**
- Closing/reopening a run (`closeRun`/`reopenRun`) — those are run-level
  actions with their own `manageProject`-adjacent semantics already; out of
  scope per the proposal.
- Retrofitting a general partial-failure UI for every bulk action in the
  app — only `recordBulkVerdict`'s current silent-drop behavior is
  addressed, because this change is what makes that gap user-visible for
  the first time (see Risks).
- An instance-wide kill switch (`PublicProjectsEnabled` has one; this
  setting doesn't need one — there's no anonymous-access-style blast
  radius to contain, it's a single project's own recording policy).

## Decisions

**D1 — Enforcement point: service layer, not middleware.**
Add `s.checkAssigneeRestriction(ctx, actor, projectID, item domain.RunItem) error`
in `service.go`, called at the top of `RecordResult` and `UpdateItem` (after
validation, before the mutating store call). Both methods already resolve
`projectID` via `ProjectIDForItem`/`ItemProjectID` for other purposes
(`UpdateItem` does today only for assignee changes — it will now do so
unconditionally to check the restriction). Rejected with a `forbidden(...)`
error, which the existing handler error-mapping already turns into `403`.

Alternative considered: a dedicated middleware/resolver that loads the item
ahead of the handler. Rejected — `requirePermission` is generic across many
routes with different resource shapes; teaching it about `RunItem.Assignee`
specifically would make it less generic for no benefit, since the two
call sites needing the check already have the item loaded or cheaply
loadable.

**D2 — New store method to load a single item's assignee.**
`RunRepo.ItemAssignee(ctx, itemID) (*domain.Assignee, error)` (mirrors the
existing narrow accessors like `ItemProjectID`) — a single-row `SELECT
assignee_user_id, assignee_team_id, ... FROM run_items WHERE id = $1`,
joined enough to build a `domain.Assignee` (or `nil` if unassigned). No
existing method returns a single `RunItem`, and adding one only to read the
assignee would be a wider surface than needed.

**D3 — Unassigned items stay permissive.**
When the setting is on but `RunItem.Assignee == nil`, any actor holding
`runRecordResult` may still act — matching the proposal's explicit call.
Rationale: this is an ownership-enforcement feature, not a lockdown; an
unowned item has no owner to protect, and blocking all recording on it
would make "leave items unassigned" a foot-gun rather than a neutral
default.

**D4 — Match rule.**
- `Assignee.Kind == user`: match if `actor.EffectiveUserID == Assignee.ID`.
- `Assignee.Kind == team`: match if `Assignee.ID` is in
  `store.Teams.TeamIDsForUser(ctx, actor.EffectiveUserID)` (existing method,
  `teams.go:125`, already used for the analogous "is this actor part of
  this team" question elsewhere).
- Bypass, regardless of assignee: Tenant Admin, or actor holds
  `manageProject` on this project (via `s.EffectivePermissions`) — "a
  project admin may always act" from the proposal. This mirrors the
  existing Tenant-Admin-bypass idiom in `MyPermissions` (`project_rbac.go:27`).

**D5 — Setting shape mirrors `PublicAccess` exactly.**
`Project.AssigneeRestrictedRecording bool` (domain), `projects.assignee_restricted_recording
boolean DEFAULT false NOT NULL` (migration `00005_assignee_restricted_recording.sql`),
`ProjectRepo.SetAssigneeRestrictedRecording` (store), `ProjectUpdate.AssigneeRestrictedRecording
*bool` handled in the existing `UpdateProject` (service — no new handler,
`PATCH /projects/{projectKey}` already routes arbitrary `ProjectUpdate`
fields through one path), new `Project.assigneeRestrictedRecording` /
`ProjectUpdate.assigneeRestrictedRecording` OpenAPI fields. No instance-wide
kill switch (see Non-Goals).

**D6 — Frontend: settings toggle + minimal bulk-failure surfacing.**
- `ProjectSettingsPage.tsx` gains a second `Card`/`Switch`, same shape as
  the "Public access" card (label, current-state pill, toggle, one line of
  explanatory copy) — no new component needed.
- `recordBulkVerdict.ts` currently does `await Promise.all(...)` and
  discards each response, including `.error` (openapi-fetch resolves
  rather than throws on 4xx). With this change shipped, a bulk verdict over
  a mixed-assignee selection would silently no-op on the items the actor
  doesn't own, with zero indication anything failed — actively misleading,
  not just an existing rough edge, once this feature exists. Minimal fix
  in scope: `recordBulkVerdict` returns `{ failedCount: number }` from
  counting responses with `.error`.
- Correction after investigation: this codebase has no toast library at
  all (checked — no `sonner`, no `.error` surfacing on any single-item
  action either). `ConfirmBanner` (`apps/web/src/components/ConfirmBanner.tsx`)
  is the established dependency-free stand-in, already used by
  `RunPage.tsx` for the "Run created" confirmation. Both of `RunPage.tsx`'s
  `recordBulkVerdict` call sites (bulk action bar and the single-row
  verdict menu added by add-run-row-status-actions) now show a
  `ConfirmBanner` ("N item(s) not updated — not assigned to you.") when
  `failedCount > 0` — bulk and single-item are treated identically, since
  neither had failure surfacing before this change. No retry/queueing —
  out of scope.

**D7 — Sample Project showcase.**
Enable the setting on one existing sample project suite/run with a mix of
an assigned item and an unassigned item, so toggling it in the UI and
attempting to record against the non-owned item visibly 403s while the
unassigned item still works. Exact seed target decided during
implementation (`seed_test.go` asserts the setting is on and both branches
exist).

## Risks / Trade-offs

- **Bulk actions become partially effective under the new policy** → D6's
  minimal count-based toast; a full retry/reassignment flow is future
  work, not blocking this change.
- **Team match requires an extra query per check** (`TeamIDsForUser`) →
  negligible; run item actions are single-row, low-frequency writes, not a
  hot read path.
- **A project admin toggling the setting on doesn't retroactively touch
  already-in-flight bulk selections in another tab** → acceptable; the
  check is evaluated per-request at write time, which is the correct
  behavior (always check current policy, not policy-at-selection-time).

## Migration Plan

Standard incremental migration (`00005_assignee_restricted_recording.sql`),
additive column with a `DEFAULT false NOT NULL` — no backfill, no behavior
change until a project admin opts in. No rollback concerns beyond the
project's standing migration-never-edited-in-place policy.

## Open Questions

None outstanding — the two open questions from the issue (unassigned-item
behavior, UI location) are resolved by D3 and D5/D6 above.
