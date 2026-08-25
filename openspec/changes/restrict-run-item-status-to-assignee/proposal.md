## Why

As a project admin, when run items are assigned to specific people, I want to
optionally require that only the assigned person (or a project admin) can
record a result or change status on that item, so ownership is enforced, not
just displayed. Today anyone holding `runRecordResult` can act on any item
regardless of its assignee, which lets someone silently record a result on
work assigned to a teammate. This was deliberately deferred (#104) until
#103 replaced the free-text assignee field with a real User/Team reference
(shipped), which is the prerequisite for a reliable identity comparison.

## What Changes

- Add a new project-level setting, `AssigneeRestrictedRecording` (default
  **off**), toggled by a project admin (gated on `manageProject`) from
  `ProjectSettingsPage.tsx`, alongside the existing `PublicAccess` toggle.
- When enabled, the following status-changing actions on a run item are
  rejected with `403` unless the authenticated actor is the item's assignee
  (a project admin may always act, regardless of assignee):
  - Recording a result (`POST /items/{itemId}/results`)
  - Updating item status, including marking retest (`PUT /items/{itemId}/status`)
  - Closing a run is unaffected — it is a run-level action, not a per-item one.
- The check compares the real authenticated actor
  (`domain.ActorFromContext`) against the item's assignee. The "record on
  behalf of" display-name override (`NewResult.Actor`) is never consulted —
  it only relabels the result, it never changes who is allowed to record it.
- An **unassigned** item stays permissive (any actor with `runRecordResult`
  may act on it) even when the setting is on — the restriction only applies
  once an item has an assignee to enforce against. This is a design decision
  captured in design.md, not left implicit.
- Team-assigned items: the actor is a match if the actor is the assigned
  team's member (matching however "team membership" already resolves
  elsewhere for permission purposes) — not just an individual-user match.

## Capabilities

### New Capabilities
- `assignee-restricted-recording`: the project-level setting, its default,
  who can toggle it, and the assignee-match enforcement rule applied to
  result recording and status updates.

### Modified Capabilities
- `test-execution`: "Run item status lifecycle" and "Append-only result log"
  requirements gain a scenario describing rejection when the setting is on
  and the actor doesn't match the assignee (or a project admin override).

## Impact

- **API**: `packages/shared/openapi.yaml` — new `Project.assigneeRestrictedRecording`
  boolean field (mirroring `publicAccess`); `PATCH /projects/{projectKey}`
  request/response gain the field. No new endpoints.
- **DB**: one migration adding `assignee_restricted_recording boolean DEFAULT
  false NOT NULL` to `projects`.
- **Go**: `domain.Project`, `store/projects.go` (`SetAssigneeRestrictedRecording`
  alongside `SetPublicAccess`), `service.go` (`RecordResult`, `UpdateItem`)
  gain the assignee-match check before their existing mutating store calls.
- **Web**: `ProjectSettingsPage.tsx` gains a second `Switch`; no other page
  changes — item action menus (`RunPage.tsx`, `RunItemDetailPage.tsx`) don't
  need new UI, a `403` from the existing action surfaces the existing error
  toast path.
- **Docs**: `docs/test-management.md` and wherever `PublicAccess` is
  documented as a project setting.
- **Sample Project**: evaluate during design whether `seed.go` should
  demonstrate the setting enabled on one project with a mixed
  assigned/unassigned item to showcase both branches.
