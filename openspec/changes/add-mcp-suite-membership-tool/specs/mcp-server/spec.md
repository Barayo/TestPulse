## ADDED Requirements

### Requirement: update_suite_membership tool
The system SHALL provide an `update_suite_membership` MCP tool that adds a test case to a suite or removes it, enforcing the caller's `manageProject`-equivalent `PermSuiteEditMembership` permission on the suite's project. The tool accepts a suite key, a case key, and an `action` of `"add"` or `"remove"`. Adding a case already in the suite, or removing a case not in the suite, SHALL succeed as a no-op rather than failing. The tool SHALL return the suite's current membership as case keys, not internal case IDs.

#### Scenario: Add a case to a suite
- **WHEN** an agent with `PermSuiteEditMembership` on a project calls `update_suite_membership` with an existing suite key, an existing case key from the same project, and `action: "add"`
- **THEN** the case is added to the suite's membership and the returned membership list includes that case's key

#### Scenario: Remove a case from a suite
- **WHEN** an agent with `PermSuiteEditMembership` calls `update_suite_membership` with a suite key, a case key currently in that suite's membership, and `action: "remove"`
- **THEN** the case is removed from the suite's membership and the returned membership list no longer includes that case's key

#### Scenario: Adding an already-member case is a no-op
- **WHEN** an agent calls `update_suite_membership` with `action: "add"` for a case already in the suite's membership
- **THEN** the call succeeds, membership is unchanged, and no error is returned

#### Scenario: Removing a non-member case is a no-op
- **WHEN** an agent calls `update_suite_membership` with `action: "remove"` for a case not currently in the suite's membership
- **THEN** the call succeeds, membership is unchanged, and no error is returned

#### Scenario: Rejected without permission
- **WHEN** an agent without `PermSuiteEditMembership` on a project calls `update_suite_membership` for a suite in that project
- **THEN** the tool call fails with a permission error and suite membership is unchanged

#### Scenario: Rejected when case belongs to a different project
- **WHEN** an agent calls `update_suite_membership` with `action: "add"` for a suite and case that belong to different projects
- **THEN** the tool call fails with a validation error and suite membership is unchanged

#### Scenario: Suite membership changes do not affect already-created runs
- **WHEN** a run has already been created from a suite's cases, and `update_suite_membership` subsequently changes that suite's membership
- **THEN** the existing run's run items remain unchanged, still pinned to the case versions captured at run-creation time
