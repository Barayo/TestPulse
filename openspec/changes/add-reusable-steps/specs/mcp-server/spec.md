## MODIFIED Requirements

### Requirement: upsert_test_case tool
The system SHALL provide an `upsert_test_case` MCP tool that creates a new test case or edits an existing one (by key), producing a new immutable version on edit, enforcing the caller's project permissions. A step entry in the tool's `steps` input MAY reference an existing step group by key instead of supplying its own `action`/`expected` content; the tool SHALL resolve such entries server-side against the referenced step group's current content, via the same resolution path used by the REST case-write routes, and SHALL NOT accept pre-resolved step content for a group-reference entry from the caller.

#### Scenario: Create a new case
- **WHEN** an agent calls `upsert_test_case` with no existing case key and valid fields
- **THEN** a new test case is created and its key and version are returned

#### Scenario: Edit rejected without permission
- **WHEN** an agent calls `upsert_test_case` for a project it does not have write access to
- **THEN** the tool call fails with a permission error and no case is modified

#### Scenario: A step entry can reference a shared step group by key
- **WHEN** an agent calls `upsert_test_case` with a step entry referencing an existing step group's key instead of its own action/expected content
- **THEN** the created or edited case version's step content includes that step group's full current step sequence at that position

## ADDED Requirements

### Requirement: upsert_step_group tool
The system SHALL provide an `upsert_step_group` MCP tool that creates a new project-scoped step group or edits an existing one (by key), enforcing the caller's `manageProject` permission on the target project.

#### Scenario: Create a new step group
- **WHEN** an agent with `manageProject` permission on a project calls `upsert_step_group` with no existing group key and a name plus one or more steps
- **THEN** a new step group is created under that project and its key is returned

#### Scenario: Edit an existing step group by key
- **WHEN** an agent with `manageProject` permission calls `upsert_step_group` with an existing group's key and updated steps
- **THEN** that step group's content is updated in place, not duplicated

#### Scenario: Rejected without manageProject permission
- **WHEN** an agent without `manageProject` permission on a project calls `upsert_step_group` for that project
- **THEN** the tool call fails with a permission error and no step group is created or modified
