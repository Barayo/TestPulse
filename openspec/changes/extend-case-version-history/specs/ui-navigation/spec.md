## MODIFIED Requirements

### Requirement: Viewing an existing test case
Selecting a test case SHALL navigate to a dedicated route
(`/projects/{projectId}/cases/{caseId}`) showing a read-only view of its title, current
version, steps, suite memberships, and version history. The page SHALL show its title and
steps as the full-width primary content, alongside a sidebar containing its properties,
version history, and a results section. Every scalar property (test type, automation,
platform, tags, version, suite memberships) SHALL render as a labeled `Label: value` pair;
priority alone SHALL render as a badge. On viewports narrower than 768px, the sidebar's
sections SHALL collapse into stacked, independently-expandable sections in the same order
as the desktop sidebar, with no content omitted. Selecting a version in the version history
SHALL open a dialog showing a field-by-field diff against the previous version and the list
of executions that pinned that version, with a Flaky indicator when both a pass and a
fail/blocked execution exist for the same version.

#### Scenario: Opening a version's detail dialog
- **WHEN** a user selects a version from the Version history list
- **THEN** a dialog opens showing that version's changes relative to the previous version and the executions that ran against it

#### Scenario: Diff shows only changed fields
- **WHEN** a user opens the detail dialog for a version where only the title and one step changed relative to the previous version
- **THEN** the dialog shows the title and that step as changed, and does not list unrelated unchanged fields

#### Scenario: Oldest version has nothing to diff against
- **WHEN** a user opens the detail dialog for a case's first version
- **THEN** the dialog states there is no previous version to compare against, instead of showing an empty or broken diff

#### Scenario: Executions list shows verdict per run
- **WHEN** a user opens the detail dialog for a version that has been executed in one or more runs
- **THEN** each execution is listed with its run name and verdict

#### Scenario: Flaky flag on mixed-verdict versions
- **WHEN** a version's executions include at least one pass and at least one failed or blocked result
- **THEN** the dialog marks that version as Flaky

#### Scenario: No flaky flag on consistent or unexecuted versions
- **WHEN** a version's executions are all the same outcome, or the version has never been executed
- **THEN** the dialog does not show a Flaky flag
