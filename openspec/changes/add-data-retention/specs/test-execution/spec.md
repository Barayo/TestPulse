## ADDED Requirements

### Requirement: Deleting a run
The system SHALL let a user with the `runDelete` permission on a run's project permanently delete that run. Deletion SHALL remove the run and every run item and result scoped to it; it is not reversible and requires no further precondition (unlike project deletion, a run does not need to be archived first — runs have no archived state).

#### Scenario: Delete a run
- **WHEN** a user with `runDelete` on the project deletes an existing run
- **THEN** the run, its items, and every recorded result for those items are permanently removed, and the run no longer appears in the project's run list

#### Scenario: Deleting a run does not affect the cases it referenced
- **WHEN** a run pinning specific case versions is deleted
- **THEN** the underlying test cases and their version history are unaffected — only the run's own items and results are removed

#### Scenario: Insufficient permission
- **WHEN** a user without `runDelete` on the project attempts to delete a run
- **THEN** the request is rejected and the run is not deleted

### Requirement: Automatic run retention
The system SHALL let a Tenant Admin configure a single, instance-wide run-retention age threshold, in days. A closed run older than the threshold, measured from its own `createdAt`, SHALL be automatically and permanently deleted by a background process the same way a manual run deletion would. A threshold of `0` SHALL mean the policy is off — no run is ever auto-deleted. Open runs SHALL never be auto-deleted regardless of age.

#### Scenario: Threshold off by default
- **WHEN** an instance has never had `runRetentionDays` configured
- **THEN** it defaults to `0` and no run is ever automatically deleted

#### Scenario: Closed run past the threshold is auto-deleted
- **WHEN** a Tenant Admin sets `runRetentionDays` to a positive number and a closed run's `createdAt` is older than that many days
- **THEN** the background worker permanently deletes the run, its items, and its results, the same as a manual `runDelete`

#### Scenario: Open runs are never auto-deleted
- **WHEN** an open run's `createdAt` is older than the configured `runRetentionDays`
- **THEN** the run is left untouched by the automatic sweep

#### Scenario: Automatic deletion is audited as a system actor
- **WHEN** the background worker deletes a run automatically
- **THEN** an audit log entry is recorded with actor kind `system`, distinct from a human- or agent-triggered deletion

#### Scenario: Only a Tenant Admin can change the threshold
- **WHEN** a user without Tenant Admin standing attempts to change `runRetentionDays`
- **THEN** the request is rejected and the threshold is unchanged
