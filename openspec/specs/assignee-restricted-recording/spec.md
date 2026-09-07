# assignee-restricted-recording

## Purpose

Letting a project admin optionally require that only a run item's assignee
(or a project admin) can record a result or change its status on that item,
so ownership displayed via assignment is actually enforced, not just shown
(`restrict-run-item-status-to-assignee`).

## Requirements

### Requirement: Project-level assignee-restricted recording setting
Each project SHALL carry an `assigneeRestrictedRecording` boolean setting, default `false`. Changing it SHALL require `manageProject` permission on the project, via the same `PATCH /projects/{projectKey}` endpoint used for the project's other settings.

#### Scenario: Default is off
- **WHEN** a project is created
- **THEN** its `assigneeRestrictedRecording` setting is `false`

#### Scenario: A project admin can enable it
- **WHEN** an actor with `manageProject` permission on a project sets `assigneeRestrictedRecording` to `true`
- **THEN** the project's setting becomes `true`

#### Scenario: An actor without manageProject cannot change it
- **WHEN** an actor without `manageProject` permission on a project attempts to set `assigneeRestrictedRecording`
- **THEN** the request is rejected with `403` and the setting is unchanged

### Requirement: Assignee-match enforcement on status-changing actions
While a project's `assigneeRestrictedRecording` setting is `true`, recording a result and updating a run item's status (including marking retest) SHALL be rejected with `403` unless the authenticated actor matches the item's assignee, holds `manageProject` on the project, or is a Tenant Admin. For a scoped agent token, `manageProject` SHALL be evaluated against the token's own granted permissions, never its creator's broader access. An item with no assignee SHALL remain unaffected by this setting — any actor holding `runRecordResult` may still act on it. The match SHALL be evaluated against the real authenticated actor resolved from the request, never against a client-supplied result `actor` display name override.

#### Scenario: The assigned user can record a result
- **WHEN** `assigneeRestrictedRecording` is `true` and the item's assignee is user A, and A (authenticated) records a result
- **THEN** the result is recorded normally

#### Scenario: A different user is rejected
- **WHEN** `assigneeRestrictedRecording` is `true` and the item's assignee is user A, and a different authenticated user B (who holds `runRecordResult` but not `manageProject`) attempts to record a result
- **THEN** the request is rejected with `403`

#### Scenario: A member of the assigned team can act
- **WHEN** `assigneeRestrictedRecording` is `true` and the item's assignee is team T, and an authenticated user who is a member of T attempts to update the item's status
- **THEN** the request succeeds

#### Scenario: A non-member of the assigned team is rejected
- **WHEN** `assigneeRestrictedRecording` is `true` and the item's assignee is team T, and an authenticated user who is not a member of T attempts to record a result
- **THEN** the request is rejected with `403`

#### Scenario: A project admin can always act
- **WHEN** `assigneeRestrictedRecording` is `true` and an actor holding `manageProject` on the project (regardless of the item's assignee) attempts to record a result or update status
- **THEN** the request succeeds

#### Scenario: A scoped agent token without manageProject cannot bypass restriction via its creator's access
- **WHEN** `assigneeRestrictedRecording` is `true`, and a scoped agent token — created by a user who separately holds `manageProject` on the project — is used to record a result on an item assigned to someone else, and the token's own role does not grant `manageProject`
- **THEN** the request is rejected with `403`, exactly as it would be for a human actor lacking `manageProject`

#### Scenario: Unassigned items stay permissive
- **WHEN** `assigneeRestrictedRecording` is `true` and a run item has no assignee, and any authenticated actor holding `runRecordResult` attempts to record a result on it
- **THEN** the request succeeds

#### Scenario: The "record on behalf of" override does not affect enforcement
- **WHEN** `assigneeRestrictedRecording` is `true` and the item's assignee is user A, and authenticated user B (not A) submits a result with an explicit `actor` display name equal to A's display name
- **THEN** the request is still rejected with `403`, because the real authenticated actor is B, not A

#### Scenario: Setting off preserves today's behavior
- **WHEN** `assigneeRestrictedRecording` is `false`
- **THEN** any actor holding `runRecordResult` on the project may record a result or update status on any item, regardless of assignee
