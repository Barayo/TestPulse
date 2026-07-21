## MODIFIED Requirements

### Requirement: Run execution board
The web UI SHALL provide a run execution board: the run's items with status and assignee, a detail pane showing the pinned case version's steps and expected result, and controls to record a verdict with an optional comment without leaving the board. The detail pane SHALL render the pinned version as a labeled `Label: value` property, consistent with the rest of the app's scalar-property presentation, rather than as an unlabeled prose sentence.

#### Scenario: Execute a case from the board
- **WHEN** a tester opens a run, selects a pending item, reviews its steps, and records verdict `pass` with a comment
- **THEN** the item's status chip updates to `pass` on the board and the result appears in the item's log

#### Scenario: Board shows pinned content
- **WHEN** a case was edited after the run was created
- **THEN** the board's detail pane shows the pinned (older) version's content with a hint that a newer version exists

#### Scenario: Pinned version renders as a labeled property
- **WHEN** a tester views a run item's detail pane
- **THEN** the pinned version is shown as a labeled `Pinned version: v{n}` property, not as an unlabeled sentence
