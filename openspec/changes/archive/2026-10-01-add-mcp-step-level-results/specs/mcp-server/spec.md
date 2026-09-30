## MODIFIED Requirements

### Requirement: record_result tool
The system SHALL provide a `record_result` MCP tool that appends a result entry (verdict, comment, actor) to a run item's append-only result log, enforcing assignee/permission restrictions identical to REST. The returned result SHALL include the `runKey` and `caseKey` the caller supplied, and SHALL NOT include a raw internal run item ID. The tool SHALL accept an optional `stepResults` array of `stepIndex`/`verdict` pairs, submitted atomically with the overall verdict; when supplied, these become the result's step-verdict snapshot and the run item's new live step verdicts, identically to REST's equivalent `stepResults` field, including server-side bounds-checking against the case's pinned step count.

#### Scenario: Record a passing result
- **WHEN** an agent calls `record_result` for a run item it is permitted to act on, with verdict `pass`
- **THEN** a new result log entry is appended recording the agent as actor, and the run item's current status updates to `pass`

#### Scenario: Recording blocked for unauthorized item
- **WHEN** an agent calls `record_result` for a run item outside its scoped permissions
- **THEN** the tool call fails with a permission error and no result entry is appended

#### Scenario: Returned result identifies the run and case by key, not internal run item ID
- **WHEN** an agent calls `record_result` successfully
- **THEN** the returned record includes the `runKey` and `caseKey` supplied in the call, and does not include a raw internal run item ID

#### Scenario: Recording step-level verdicts atomically with the overall result
- **WHEN** an agent calls `record_result` with a `stepResults` array identifying which step failed
- **THEN** the returned result includes that step-verdict snapshot, and the run item's live per-step state reflects it for a later retest

#### Scenario: Step index out of bounds is rejected
- **WHEN** an agent calls `record_result` with a `stepResults` entry whose `stepIndex` exceeds the case's pinned step count
- **THEN** the tool call fails with a validation error and no result entry is appended
