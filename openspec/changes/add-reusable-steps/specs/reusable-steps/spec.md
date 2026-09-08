## ADDED Requirements

### Requirement: Project-scoped shared step groups
A project SHALL support named, ordered step groups (`StepGroup`: name +
an ordered list of `{action, expected}` steps), scoped to that project.
Creating, editing, and deleting a step group SHALL require `manageProject`
permission on the project. Reading (listing/getting) a step group SHALL
require only `read` permission on the project.

#### Scenario: A project admin creates a step group
- **WHEN** an actor with `manageProject` permission on a project creates a
  step group with a name and one or more steps
- **THEN** the step group is created and listed under that project

#### Scenario: Creating a step group without manageProject is rejected
- **WHEN** an actor without `manageProject` permission on a project
  attempts to create a step group
- **THEN** the request is rejected with `403`

#### Scenario: Reading a step group only requires read access
- **WHEN** an actor with only `read` permission on a project lists or
  fetches that project's step groups
- **THEN** the request succeeds

### Requirement: Deleting a step group is a soft delete
Deleting a step group SHALL be a soft delete: it disappears from listings
and pickers, but does not alter or invalidate any case version that
already resolved and snapshotted its content.

#### Scenario: Deleting a group does not change cases that already reference it
- **WHEN** a step group referenced by an existing case version is deleted
- **THEN** that case version's already-saved step content is unchanged

#### Scenario: A deleted group no longer appears in listings
- **WHEN** a step group is deleted
- **THEN** subsequent listings of that project's step groups do not
  include it

### Requirement: A case's step entry may reference a step group, resolved and snapshotted at save time
A `Step` entry within a test case's content MAY carry a reference to a
step group instead of (or in addition to identifying) its own
`action`/`expected` content. When a case version is created or edited,
every step-group-referencing entry SHALL be resolved server-side against
that step group's *current* content and expanded into the persisted
version's step list — the referenced group's entire step sequence, not a
single step. The server SHALL perform this resolution itself and SHALL
NOT accept pre-resolved step content for a group-reference entry from the
client. Once a case version is saved, its resolved step content SHALL NOT
change even if the source step group is later edited or deleted.

#### Scenario: A group reference expands to all of the group's steps at save time
- **WHEN** a case is saved with a step entry referencing a 3-step step
  group at a given position
- **THEN** the saved version's step list contains all 3 of that group's
  steps at that position, in order

#### Scenario: A client cannot smuggle pre-resolved content for a group reference
- **WHEN** a client submits a case save with a group-reference step entry
  accompanied by client-supplied step content that does not match the
  referenced group's actual current content
- **THEN** the server ignores the client-supplied content and persists
  the group's actual current content instead

#### Scenario: Editing the source group does not change an already-saved case version
- **WHEN** a step group is edited after a case version was saved
  referencing it
- **THEN** the already-saved case version's step content is unchanged

#### Scenario: A later edit to the same case can pick up the group's new content
- **WHEN** an author edits a case whose current content references a step
  group that has since changed, and saves without detaching that
  reference
- **THEN** the newly saved version's resolved content reflects the step
  group's current content, not the prior snapshot

### Requirement: Staleness is surfaced explicitly during editing, never applied silently
The case editor SHALL track, per group-reference step entry, the
timestamp at which its content was last resolved (snapshotted). While
editing a case (not viewing a previously saved version), if a referenced
step group's content has changed since that entry's last snapshot, the
editor SHALL surface this to the author with an explicit action to
refresh that entry to the group's current content. Refreshing SHALL NOT
persist anything until the author separately saves the case edit.

#### Scenario: A stale group reference is flagged during editing
- **WHEN** an author opens a case for editing and one of its step-group
  references was snapshotted before the source group's most recent edit
- **THEN** the editor indicates that entry has updates available, without
  changing the case's saved content

#### Scenario: Refreshing does not save automatically
- **WHEN** an author triggers a refresh on a stale group reference while
  editing a case
- **THEN** the case's saved content is unchanged until the author
  separately saves the edit

### Requirement: A case referencing a deleted step group can be detached
If a case's current (unsaved-edit) content references a step group that
has since been deleted, the case editor SHALL NOT offer a refresh action
for that entry (there is nothing to refresh from) and SHALL instead offer
to detach it: convert that entry from a group reference into plain,
independently editable steps using its last-resolved content.

#### Scenario: A reference to a deleted group offers detach instead of refresh
- **WHEN** an author edits a case whose current content references a step
  group that has been deleted
- **THEN** the editor offers to detach that entry into plain steps rather
  than offering a refresh action

#### Scenario: Detaching preserves the last-known content
- **WHEN** an author detaches a group reference whose source group was
  deleted
- **THEN** the entry becomes plain, independently editable steps matching
  its last-resolved content
