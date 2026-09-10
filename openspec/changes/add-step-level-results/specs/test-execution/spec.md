## MODIFIED Requirements

### Requirement: Append-only result log
Each run item SHALL have an append-only result log. A result records an actor, verdict (`pass`, `failed`, `skipped`, `blocked`), optional comment, and timestamp. Results MUST NOT be editable or deletable through the API. A result MAY additionally carry optional execution metadata: start time, end time, platform, version, and tags. Recording a result SHALL require `runRecordResult` permission on the run's project. When the project's `assigneeRestrictedRecording` setting is enabled, recording a result is additionally subject to the assignee-match enforcement defined in the `assignee-restricted-recording` capability. A bulk verdict action recording the same verdict against multiple selected items SHALL produce one independent result row per item — identical in shape to, and indistinguishable in the log from, that many individual recordings — never a single combined or summarized entry; when the setting rejects some of the selected items, the successfully recorded items SHALL still be committed independently rather than the whole batch failing together. A result MAY additionally carry a snapshot of the run item's step verdicts at the moment it was recorded (see the `step-level-results` capability).

The actor SHALL default to the authenticated caller who recorded the result; a client MAY still explicitly supply an `actor` display name to override it (e.g. an agent recording a result on behalf of a named human tester). Regardless of an override, the result SHALL also store which real actor (if any) authenticated the request that created it, denormalized so that link survives the actor's own later deletion. A result recorded before this capability existed has no real actor behind it and is marked accordingly, rather than erroring or fabricating an identity.

#### Scenario: Results accumulate
- **WHEN** an item receives verdict `failed`, is marked retest, and then receives verdict `pass`
- **THEN** the result log lists both results in order and the item's current status is `pass`

#### Scenario: Actor defaults to the authenticated caller
- **WHEN** a result is submitted without an `actor`
- **THEN** the result's actor is the display name of whoever authenticated the request (a user's email, or an agent token's name)

#### Scenario: Actor can be overridden while the run is open
- **WHEN** a result is submitted with an explicit `actor` display name, different from the authenticated caller
- **THEN** the result displays the submitted name, while still recording which real actor authenticated the request that created it

#### Scenario: Pre-existing results show as unknown, not broken
- **WHEN** a result recorded before this capability existed is read
- **THEN** its original actor display name is shown, with no real actor linked (`unknown`) rather than an error or a fabricated identity

#### Scenario: A permission that doesn't include runRecordResult cannot record a result
- **WHEN** a user whose effective permissions on a run's project do not include `runRecordResult` attempts to record a result
- **THEN** the request is rejected with `403`

#### Scenario: Execution metadata is optional
- **WHEN** a result is recorded without start time, end time, platform, version, or tags
- **THEN** the result is recorded normally, with those fields absent

#### Scenario: A manually-recorded result can also carry execution metadata
- **WHEN** a user records a verdict through the UI and supplies a platform or version
- **THEN** the result reflects it, the same as a result produced by an import

#### Scenario: A bulk verdict produces one row per item, not a batch record
- **WHEN** a user bulk-records `failed` against 3 selected items
- **THEN** the result log gains exactly 3 new rows, one per item, each independently attributed to the same actor and timestamped individually

#### Scenario: A bulk verdict partially rejected by assignee restriction still commits the eligible items
- **WHEN** the project's `assigneeRestrictedRecording` setting is enabled and a user bulk-records a verdict against 3 selected items, 2 of which are assigned to that user and 1 assigned to someone else
- **THEN** the 2 eligible items each gain a new result row and the 1 ineligible item is rejected with `403`, with no effect on the other two

#### Scenario: A result without any step marked carries no step snapshot
- **WHEN** a result is recorded on a run item with no steps ever marked
- **THEN** the result carries no step-verdict snapshot, exactly as it would before the `step-level-results` capability existed
