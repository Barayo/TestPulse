## MODIFIED Requirements

### Requirement: Run item assignment
The system SHALL let a user with `runRecordResult` permission on a project assign a run item to a real user or team who is a member of that project — free text is no longer accepted as an assignment input. Each run item SHALL reference its assignee via a real foreign key (`assigneeUserId` xor `assigneeTeamId`), enforced by the database; if the referenced user or team is later deleted, the item SHALL automatically revert to unassigned rather than retaining a dangling reference. Any user with `read` permission MAY filter a run's items by assignee. The web UI SHALL provide an assign control on each run item's board row, reached via the row's existing right-click/`⋯` menu, offering a search-and-pick list scoped to the project's actual members (people and teams, listed separately). The board SHALL provide an assignee filter alongside the existing status filter: one chip per distinct assignee present in the run, plus an explicit `Unassigned` chip and an `All` chip, composing with the status filter and grouping without hiding any item that neither filter excludes. The board SHALL support selecting multiple items and assigning them all to one real user or team in one action. Run creation SHALL accept an optional default assignee (a real project member), applied to every item in the newly created run.

#### Scenario: Assign and filter
- **WHEN** two items are assigned to the user Ana and one to the user Luis
- **THEN** filtering the run's items by assignee Ana returns exactly the two items

#### Scenario: Assigning an item from the board
- **WHEN** a user with `runRecordResult` permission opens an item's row menu, chooses "Assign to…", and picks a project member from the list
- **THEN** the item's assignee updates to that real user, and the row reflects it without a full page reload

#### Scenario: The picker lists the project's real members, not free text
- **WHEN** a user opens the assign dialog for an item
- **THEN** the list shows the project's actual users and teams, separately labeled, and offers no way to type an arbitrary name instead

#### Scenario: Assigning to a non-member is rejected
- **WHEN** an assignment request references a user or team id that is not a member of the item's project
- **THEN** the request is rejected rather than silently creating the assignment

#### Scenario: Deleting the assigned user or team reverts the item to unassigned
- **WHEN** a user or team that is currently assigned to a run item is deleted
- **THEN** the item's assignee becomes null (`Unassigned`) automatically, with no dangling reference left behind

#### Scenario: Filtering to Unassigned
- **WHEN** a user selects the "Unassigned" assignee filter chip on a run with both assigned and unassigned items
- **THEN** only items with no assignee are shown

#### Scenario: Assignee filter composes with the status filter
- **WHEN** a user has an assignee filter and a status filter both active
- **THEN** only items matching both are shown

#### Scenario: Bulk-assigning selected items
- **WHEN** a user selects several items on the board and assigns them all to the user Ana in one action
- **THEN** every selected item's assignee becomes Ana

#### Scenario: A new run's items inherit its default assignee
- **WHEN** a user creates a run with a default assignee of the user Ana
- **THEN** every item in that run is assigned to Ana immediately after creation

#### Scenario: A run created without a default assignee leaves items unassigned
- **WHEN** a user creates a run without specifying a default assignee
- **THEN** every item in that run starts unassigned, unchanged from today's behavior
