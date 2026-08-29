# test-authoring

## Purpose

Creating and organizing test assets: projects, versioned test cases (with a
mandatory nested folder tree for browsing/organization), and suites (an
independent n:m grouping used for execution).
## Requirements
### Requirement: Project management
The system SHALL let a Tenant Admin create projects, where a project is the container for all test assets. A project MAY carry an optional `description` (free text), settable at creation or updated later. There is no owner concept — access to a project is determined entirely by project membership (see `project-membership`), assigned by a Tenant Admin after creation. Every project SHALL be assigned an immutable, unique `key` at creation (see `resource-keys`), used to address it in the API and UI. Every project SHALL carry an `isSample` flag, `false` unless the project is the automatically-created Sample Project (see `sample-data`). Any user with `read` permission on a project SHALL be able to list and read it; a Tenant Admin SHALL be able to list and read every project regardless of membership. Renaming, updating the description, archiving, and unarchiving a project SHALL require `manageProject` permission (or Tenant Admin). Archiving and unarchiving are both reversible, low-stakes actions — neither removes any data; only permanent deletion (see below) does.

#### Scenario: Unarchiving a project restores it to active
- **WHEN** a user with `manageProject` permission unarchives a previously-archived project
- **THEN** the project's archived flag clears and it behaves exactly as any other active project again

#### Scenario: Create a project
- **WHEN** a Tenant Admin submits a new project with a name
- **THEN** the project is created and appears in the project list

#### Scenario: Non-Tenant-Admin cannot create a project
- **WHEN** a non-Tenant-Admin user submits a new project
- **THEN** the request is rejected with `403`

#### Scenario: Project name is required
- **WHEN** a Tenant Admin submits a project without a name
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Description is optional
- **WHEN** a Tenant Admin creates a project with only a name
- **THEN** the project is created with an empty description

#### Scenario: Description can be set later
- **WHEN** a user with `manageProject` permission updates their project with a description
- **THEN** the project reflects it on subsequent reads

#### Scenario: A newly created project has a key
- **WHEN** a Tenant Admin creates a project
- **THEN** the project is created with a `key` assigned, with no separate step required

#### Scenario: Normally-created projects are never marked sample
- **WHEN** a Tenant Admin creates a project through the normal create action
- **THEN** the project's `isSample` flag is `false`

#### Scenario: Project list is scoped to membership
- **WHEN** a non-Tenant-Admin user with a role on two of five existing projects lists projects
- **THEN** only those two projects are returned

#### Scenario: A permission that doesn't include manageProject cannot update project settings
- **WHEN** a user whose effective permissions on a project do not include `manageProject` attempts to rename, re-describe, or archive that project
- **THEN** the request is rejected with `403`

### Requirement: Deleting an archived project
The system SHALL let a user with the `projectDelete` permission on a project permanently delete it, but only once the project is already archived. Because a project's data volume is unbounded, deletion SHALL execute asynchronously: the project is queued for deletion and hidden from all project listings immediately, and a background process then permanently removes every section, case (and all of its versions), suite, run, run item, and result scoped to that project, and every membership row (direct or team-based) assigning a role on it. This is separate from, and strictly more destructive than, archiving: archiving hides a project and is reversible; deletion is permanent and is not.

#### Scenario: Delete an archived project
- **WHEN** a user with `projectDelete` deletes a project that is already archived
- **THEN** the project is immediately hidden from all project listings, and everything scoped to it (sections, cases, case versions, suites, runs, run items, results, membership rows) is permanently removed by a background process without requiring further action

#### Scenario: Cannot delete an active project
- **WHEN** a user attempts to delete a project that is not archived
- **THEN** the request is rejected with a validation error, and the project is untouched — a project must be archived first

#### Scenario: Insufficient permission
- **WHEN** a user without `projectDelete` on the project attempts to delete it, even if archived
- **THEN** the request is rejected and the project is not deleted

#### Scenario: Deletion resumes after a server restart
- **WHEN** a project is queued for deletion and the server restarts before the background process finishes removing everything scoped to it
- **THEN** deletion resumes automatically on the next startup without requiring the admin to retry, and eventually completes

### Requirement: Automatic project archiving
The system SHALL let a Tenant Admin configure a single, instance-wide inactivity threshold, in days. A non-archived project whose activity — the newest of its own creation time, its most recently created run, its most recently created case version, and its most recently created suite — is older than the threshold SHALL be automatically archived by a background process the same way a manual archive would be. A threshold of `0` SHALL mean the policy is off — no project is ever auto-archived. A Tenant Admin MAY exempt an individual project from this policy; only a Tenant Admin, never a Project Admin or any custom role, SHALL be able to set or clear a project's exemption. Automatic archiving is never destructive — an auto-archived project can be unarchived at any time, exactly as if it had been archived manually.

#### Scenario: Threshold off by default
- **WHEN** an instance has never had `autoArchiveInactiveDays` configured
- **THEN** it defaults to `0` and no project is ever automatically archived

#### Scenario: An inactive project is auto-archived
- **WHEN** a Tenant Admin sets `autoArchiveInactiveDays` to a positive number and a non-archived, non-exempt project's activity is older than that many days
- **THEN** the background worker archives the project the same way a manual archive does

#### Scenario: Recent activity keeps a project from being auto-archived
- **WHEN** a project was created long ago but has a run, case version, or suite created more recently than the configured threshold
- **THEN** the project is left untouched by the automatic sweep, regardless of the project's own age

#### Scenario: An exempted project is never auto-archived
- **WHEN** a Tenant Admin has exempted a project from automatic archiving
- **THEN** the background worker never archives that project, no matter how inactive it is, until the exemption is cleared

#### Scenario: Only a Tenant Admin can set or clear the exemption
- **WHEN** a user without Tenant Admin standing — including a Project Admin with `manageProject` on the project — attempts to set or clear a project's auto-archive exemption
- **THEN** the request is rejected and the project's exemption is unchanged

#### Scenario: Only a Tenant Admin can change the instance-wide threshold
- **WHEN** a user without Tenant Admin standing attempts to change `autoArchiveInactiveDays`
- **THEN** the request is rejected and the threshold is unchanged

#### Scenario: Automatic archiving is audited as a system actor
- **WHEN** the background worker archives a project automatically
- **THEN** an audit log entry is recorded with actor kind `system`, distinct from a human-triggered archive

#### Scenario: Auto-archiving is fully reversible
- **WHEN** a project is automatically archived by the policy
- **THEN** a user with `manageProject` on it can unarchive it at any time, exactly as they could a manually-archived project

### Requirement: Test case creation
The system SHALL let a user with `caseCreate` permission on a project create test cases within it, with title, description, steps, expected result, priority, and tags. Creating a case establishes version 1. A case MAY additionally carry `platform` (free text), `testType` (free text), and `automated` (boolean, defaults to false), settable at creation or updated later. Every case SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI.

A case's content SHALL be authored in one of three formats, chosen at
creation and changeable later: `steps` (structured `action`/`expected`
steps — the default), `text` (free-form narrative in `description`, no
structured steps), or `gherkin` (a free-form `Given/When/Then` source
block). A case not given an explicit format defaults to `steps`.

Creating a case in the web UI SHALL use a dedicated page
(`/projects/{projectKey}/cases/new`), not a drawer or dialog — the same
breadcrumb/header/content-plus-sidebar shape used for viewing and editing
a case, so creation, viewing, and editing present as the same page in
different states.

#### Scenario: Create a test case
- **WHEN** a user with `caseCreate` permission creates a case with a title and steps
- **THEN** the case exists at version 1 and is listed in its project

#### Scenario: Title is required
- **WHEN** a user creates a case without a title
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: A permission that doesn't include caseCreate cannot create a case
- **WHEN** a user whose effective permissions on a project do not include `caseCreate` attempts to create a case
- **THEN** the request is rejected with `403`

#### Scenario: Classification fields are optional
- **WHEN** a user creates a case without platform, testType, or automated
- **THEN** the case is created with those fields empty and `automated` defaulting to false

#### Scenario: Classification fields can be set later
- **WHEN** a user updates an existing case with a platform, testType, and automated status
- **THEN** the case reflects all three on subsequent reads

#### Scenario: Classification fields are editable from the case creation page
- **WHEN** a user creates or edits a case in the web UI
- **THEN** the page shows editable controls for priority, tags, platform, test type, and automated status, not just title and content

#### Scenario: Editing a case from the UI preserves fields the editor doesn't show
- **WHEN** a user edits a case's title or steps from the UI without changing its description or expected result
- **THEN** the case's description and expected result are unchanged in the new version, not reset to empty

#### Scenario: A newly created case has a key
- **WHEN** a user creates a test case in a project
- **THEN** the case is created with a `key` assigned, scoped to that project

#### Scenario: A case defaults to structured-steps format
- **WHEN** a user creates a case without specifying a content format
- **THEN** the case is created with `format` set to `steps`

#### Scenario: Creating a free-text case
- **WHEN** a user creates a case with `format` set to `text` and a description
- **THEN** the case is created with that format and its narrative stored in `description`, with no structured steps

#### Scenario: Creating a Gherkin case
- **WHEN** a user creates a case with `format` set to `gherkin` and a `Given/When/Then` source block
- **THEN** the case is created with that format and the source stored and returned on subsequent reads

#### Scenario: Format is selectable when authoring a case
- **WHEN** a user creates a case in the web UI, or edits an existing case's content
- **THEN** a format picker offers a choice between structured steps, free text, and Gherkin, showing only the fields relevant to the selected format — in the same shell the read view uses

#### Scenario: Switching format on an existing case
- **WHEN** a user changes an existing case's format to one different from its current format
- **THEN** the new version reflects the new format, and the UI warns before discarding content from the format being abandoned if that content is non-empty

#### Scenario: Creating a case opens a dedicated page scoped to its target section
- **WHEN** a user clicks "New test case" while browsing a section in the Library
- **THEN** the browser navigates to a case-creation page addressed to that section, rather than opening an overlay on the current page

#### Scenario: Creating a case lands on the new case's own page
- **WHEN** a user successfully creates a case from the case-creation page
- **THEN** the browser navigates to the new case's own detail page

### Requirement: Immutable test case versioning
Every edit to a test case's content SHALL create a new immutable
version; previous versions MUST remain readable forever. The case
always exposes its current version number. Editing a case SHALL
require `caseEdit` permission. Every version SHALL record the actor
who created it (`actorKind`: `user`/`agent`/`unknown`, `actorRefId`),
resolved from the authenticated caller — mirroring how a recorded
result already tracks its actor. A user with `caseEdit` permission
SHALL be able to restore an old version's content, which SHALL create
a new version rather than modifying or reusing the target version's
own version number. A version's content MAY include values for the
project's custom fields (see `case-custom-fields`); those values are
versioned exactly like every other field — immutable once recorded,
never rewritten by a later field/option rename or deletion.

#### Scenario: Editing creates a new version
- **WHEN** a user with `caseEdit` permission edits the steps of a case at version 1
- **THEN** the case's current version becomes 2 and version 1's content is unchanged and still retrievable

#### Scenario: Version history is listable
- **WHEN** a user with `read` permission on the project requests the version history of a case with 3 versions
- **THEN** all 3 versions are returned with their content and creation timestamps

#### Scenario: A permission that doesn't include caseEdit cannot edit a case
- **WHEN** a user whose effective permissions on a project do not include `caseEdit` attempts to edit a case's steps
- **THEN** the request is rejected with `403`

#### Scenario: Restoring an old version creates a new version with its content
- **WHEN** a case is at version 3 and a user with `caseEdit` permission restores version 1
- **THEN** a new version 4 is created with version 1's content, and versions 1 through 3 remain unchanged and readable

#### Scenario: Restoring never reuses a version number
- **WHEN** a case is restored any number of times
- **THEN** every restore produces a strictly higher version number than any that came before it, never reusing or overwriting an existing one

#### Scenario: A new version records who created it
- **WHEN** an authenticated user creates a case or saves an edit
- **THEN** the resulting version's `actorKind` and `actorRefId` reflect that authenticated caller

#### Scenario: Versions predating this capability show no actor
- **WHEN** a version was created before actor tracking existed
- **THEN** it reads back with `actorKind: "unknown"` rather than a fabricated identity

#### Scenario: A custom field value change creates a new version like any other edit
- **WHEN** a user with `caseEdit` permission changes only a custom field's
  value, no other content
- **THEN** a new version is created, and the previous version's recorded
  value for that field is unchanged and still retrievable

### Requirement: Test suite grouping
The system SHALL let a user with `suiteCreate` permission create suites within a project, and a user with `suiteEditMembership` permission manage an n:m membership between suites and test cases. Every suite SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI. The web UI SHALL present suite creation and suite membership editing through the same checkbox-grid selection component: a filterable, checkbox-per-case list with a persistent selection count, rather than separate one-case-at-a-time flows. Toggling a case's checkbox SHALL update the selection regardless of which filter is currently applied, and changing a filter SHALL NOT alter which cases are selected. Suite creation SHALL let a user select cases in the same screen as naming the suite, rather than requiring the suite to be created empty first. Editing an existing suite's membership SHALL present the same grid pre-checked with its current members, committing only the net difference (added and removed cases) when saved.

#### Scenario: Add cases to a suite
- **WHEN** a user with `suiteEditMembership` permission adds two cases to a suite
- **THEN** the suite lists both cases, and each case can also belong to other suites

#### Scenario: Removing a case from a suite does not delete the case
- **WHEN** a user with `suiteEditMembership` permission removes a case from a suite
- **THEN** the case no longer appears in the suite but still exists in the project

#### Scenario: A newly created suite has a key
- **WHEN** a user with `suiteCreate` permission creates a suite in a project
- **THEN** the suite is created with a `key` assigned, scoped to that project

#### Scenario: Selecting cases at creation time
- **WHEN** a user names a new suite and checks several cases in the same screen before submitting
- **THEN** the created suite's membership includes exactly the checked cases, with no separate follow-up step required

#### Scenario: A filter change preserves checked selections
- **WHEN** a user checks a case, then applies a filter that hides that case from the visible list, then clears the filter
- **THEN** the case is still shown as checked

#### Scenario: Editing membership commits only the net change
- **WHEN** a user opens an existing suite's membership, unchecks one current member, checks two new cases, and saves
- **THEN** exactly one case is removed and exactly two cases are added — no other membership changes occur

#### Scenario: No cases match the applied filters
- **WHEN** a user applies a combination of filters that matches no test cases
- **THEN** the grid shows an explicit empty state rather than an empty list with no explanation

#### Scenario: A permission that doesn't include suiteEditMembership cannot modify suite membership
- **WHEN** a user whose effective permissions on a project do not include `suiteEditMembership` attempts to add or remove a case from a suite
- **THEN** the request is rejected with `403`

### Requirement: Soft deletion protects run history
Deleting a test case SHALL be a soft delete: the case disappears from authoring lists but its versions remain readable wherever runs reference them. Deleting a case SHALL require `caseDelete` permission.

#### Scenario: Deleted case referenced by a run
- **WHEN** a user with `caseDelete` permission deletes a case that appears in a past run
- **THEN** the run still shows the pinned case version content, and the case no longer appears in the project's case list

#### Scenario: A permission that doesn't include caseDelete cannot delete a case
- **WHEN** a user whose effective permissions on a project do not include `caseDelete` attempts to delete a case
- **THEN** the request is rejected with `403`

### Requirement: Project-level case folders
The system SHALL let a user with `sectionCreate` permission organize test cases into a nested folder tree, scoped per project and independent of suite membership. Every project SHALL have a root folder created automatically with the project. Every test case SHALL belong to exactly one folder at a time, defaulting to the project's root folder when not specified. Moving a case between folders SHALL require `caseEdit` permission.

#### Scenario: New project has a root folder
- **WHEN** a project is created
- **THEN** it has a root folder that new cases default into when no folder is specified

#### Scenario: Create a nested folder
- **WHEN** a user with `sectionCreate` permission creates a subfolder inside an existing folder
- **THEN** the new folder appears as a child of that folder, and folders can be nested to arbitrary depth

#### Scenario: Case defaults into the root folder
- **WHEN** a user creates a case without specifying a folder
- **THEN** the case is placed in the project's root folder

#### Scenario: Move a case to a different folder
- **WHEN** a user with `caseEdit` permission moves a case from one folder to another
- **THEN** the case appears only in the destination folder, and its suite memberships are unaffected

#### Scenario: Folders are independent of suites
- **WHEN** a case lives in a folder and also belongs to two suites
- **THEN** moving the case to a different folder does not change its suite memberships, and adding/removing it from a suite does not change its folder

#### Scenario: A permission that doesn't include sectionCreate cannot create or move folders
- **WHEN** a user whose effective permissions on a project do not include `sectionCreate` attempts to create a folder
- **THEN** the request is rejected with `403`

### Requirement: Deleting a folder cascades to its subtree
Deleting a folder SHALL soft-delete that folder and every folder and test case anywhere in its subtree, rather than reparenting them. A soft-deleted folder or case no longer appears in folder listings, the folder tree, or the project's case list, but its data (and, for a case, its version history) is preserved and remains visible wherever a run references it, matching the existing soft-deletion guarantee for individually deleted cases. The root folder itself MUST NOT be deletable. Deleting a folder SHALL require `sectionDelete` permission.

#### Scenario: Delete a folder with cases
- **WHEN** a user with `sectionDelete` permission deletes a folder containing cases and having no subfolders
- **THEN** every case in that folder is soft-deleted and no longer appears in the project's case list

#### Scenario: Delete a folder with nested subfolders
- **WHEN** a user deletes a folder that has one or more child folders, themselves containing cases
- **THEN** every descendant folder and every case at any depth within the deleted folder's subtree is soft-deleted

#### Scenario: A deleted folder referenced by a run keeps history intact
- **WHEN** a folder is deleted and one of its former cases appears in a past run
- **THEN** the run still shows the pinned case version content, same as when a case is deleted directly

#### Scenario: Root folder cannot be deleted
- **WHEN** a user attempts to delete a project's root folder
- **THEN** the request is rejected

#### Scenario: A permission that doesn't include sectionDelete cannot delete a folder
- **WHEN** a user whose effective permissions on a project do not include `sectionDelete` attempts to delete a folder
- **THEN** the request is rejected with `403`

### Requirement: Moving a folder to a different parent

The system SHALL let a user with `sectionEdit` permission move (reparent) a
folder to a different parent folder within the same project. The move
SHALL be rejected when the target is the folder itself or any descendant
of the folder — a cycle — regardless of client-side filtering, since the
server is the authoritative guard. The project's root folder MUST NOT be
moved (it has no parent to leave, and no folder may become its parent).
Moving a folder SHALL NOT change which suites its cases belong to, the
same independence folders and suites already have for a single case.

#### Scenario: Move a folder to a different parent
- **WHEN** a user with `sectionEdit` permission moves a folder to a different, non-descendant parent
- **THEN** the folder (and its entire existing subtree) now appears under the new parent, and no longer under the old one

#### Scenario: Moving a folder into its own descendant is rejected
- **WHEN** a user attempts to move a folder into one of its own subfolders
- **THEN** the request is rejected and the folder's parent is unchanged

#### Scenario: Moving a folder into itself is rejected
- **WHEN** a user attempts to move a folder to itself as its own parent
- **THEN** the request is rejected and the folder's parent is unchanged

#### Scenario: The root folder cannot be moved
- **WHEN** a user attempts to move a project's root folder
- **THEN** the request is rejected

#### Scenario: A permission that doesn't include sectionEdit cannot move a folder
- **WHEN** a user whose effective permissions on a project do not include `sectionEdit` attempts to move a folder
- **THEN** the request is rejected with `403`

### Requirement: Destructive actions are tucked behind a per-row menu and require confirmation
The web UI SHALL present every destructive or reorganizing row action (case: "Move to…", "Delete"; folder: "Move to…", "Delete"; section-tree node: "New section") through a closed-by-default contextual menu attached to that row, opened via either a visible trigger or a right-click anywhere on the row — never a standalone always-visible delete icon, an app-wide mode toggle, or a right-click-only trigger with no visible affordance. Right-clicking a row SHALL open its menu at the cursor position and SHALL NOT show the browser's native context menu. A row's menu SHALL include "Delete" only when the actor's effective project permissions include `caseDelete` (for a case row) or `sectionDelete` (for a folder row); SHALL include "Move to…" on a folder row only when the actor's effective permissions include `sectionEdit`. A folder row's trigger SHALL render whenever the actor has `sectionEdit`, `sectionDelete`, or both — rendering neither item, and hiding the trigger entirely, only when the actor has neither permission. A case row's trigger SHALL always render "Move to…" regardless of permission, since moving a case requires no explicit permission check today. Every delete action, once selected from the menu, SHALL show a confirmation dialog stating what will be removed before it executes; for a folder, the dialog states the number of cases and subfolders in its subtree. Canceling the dialog SHALL make no change.

#### Scenario: Row menu is closed by default
- **WHEN** a user with delete permission opens the Library view
- **THEN** no row's menu is open, and no delete or move action is visible until a row's own menu trigger is clicked

#### Scenario: Opening a case row's menu reveals Move and, with permission, Delete
- **WHEN** a user with `caseDelete` permission opens a case row's menu
- **THEN** the menu lists "Move to…" and, below a divider, "Delete"

#### Scenario: A case row's menu omits Delete without caseDelete permission
- **WHEN** a user whose effective permissions do not include `caseDelete` opens a case row's menu
- **THEN** the menu lists "Move to…" only

#### Scenario: Opening a folder row's menu with both permissions reveals Move to… and Delete
- **WHEN** a user with both `sectionEdit` and `sectionDelete` permission opens a folder row's menu
- **THEN** the menu lists "Move to…" and, below a divider, "Delete"

#### Scenario: A folder row's menu offers Move to… without sectionDelete permission
- **WHEN** a user with `sectionEdit` but not `sectionDelete` opens a folder row's menu
- **THEN** the menu lists "Move to…" only

#### Scenario: A folder row's menu offers Delete without sectionEdit permission
- **WHEN** a user with `sectionDelete` but not `sectionEdit` opens a folder row's menu
- **THEN** the menu lists "Delete" only

#### Scenario: A folder row's menu trigger is not shown without either permission
- **WHEN** a user whose effective project permissions include neither `sectionEdit` nor `sectionDelete` opens the Library view
- **THEN** no menu trigger is shown on any folder row

#### Scenario: Deleting a folder requires confirming its subtree size
- **WHEN** a user selects "Delete" from a folder row's menu, for a folder containing cases and subfolders
- **THEN** a confirmation dialog states how many cases and subfolders will be removed before the deletion proceeds

#### Scenario: Canceling a delete confirmation makes no change
- **WHEN** a user selects "Delete" from a row's menu and then cancels the confirmation dialog
- **THEN** no request is made and the case or folder remains exactly as it was

#### Scenario: Right-clicking a case or folder row opens its menu at the cursor
- **WHEN** a user right-clicks a case or folder row in the content list
- **THEN** that row's menu opens at the cursor position, listing the same items the visible trigger would, and the browser's native context menu does not appear

#### Scenario: The section tree's "New section" action has a visible trigger, not just right-click
- **WHEN** a user views a folder node in the section tree
- **THEN** a visible menu trigger is present on that node offering "New section", in addition to the same action being reachable via right-click at the cursor

### Requirement: Linking a test case to a Jira issue

A test case SHALL support an optional `jiraIssueKey`, settable and clearable via a dedicated `PUT /cases/{key}/jira-link` endpoint (never the versioned content-edit endpoint, following the same precedent as the existing case-move endpoint) — setting or clearing it SHALL NOT create a new case version. When set, the case SHALL also expose `jiraIssueSummary`, `jiraIssueStatus`, and `jiraLastSyncedAt` fields, populated only via a separate `PUT /cases/{key}/jira-sync` endpoint used by the Jira connector (see `jira-connector` capability) — the case-link and content-edit endpoints have no request field for these cached values at all.

#### Scenario: Set a Jira issue key on a case

- **WHEN** a user with edit permission calls `PUT /cases/{key}/jira-link` with `jiraIssueKey: "PROJ-123"`
- **THEN** the case's `jiraIssueKey` is stored as `"PROJ-123"` and its `currentVersion` is unchanged

#### Scenario: Clearing a Jira issue key also clears its cached summary

- **WHEN** a user calls `PUT /cases/{key}/jira-link` with `jiraIssueKey: null` on a linked case
- **THEN** `jiraIssueKey`, `jiraIssueSummary`, `jiraIssueStatus`, and `jiraLastSyncedAt` are all cleared

#### Scenario: The cache-sync endpoint requires an existing link

- **WHEN** `PUT /cases/{key}/jira-sync` is called on a case whose `jiraIssueKey` is null
- **THEN** the request is rejected, since there is no link for the cached data to describe

#### Scenario: A new case has no Jira link by default

- **WHEN** a test case is created without a `jiraIssueKey`
- **THEN** `jiraIssueKey`, `jiraIssueSummary`, `jiraIssueStatus`, and `jiraLastSyncedAt` are all null

#### Scenario: Filtering the case list to only Jira-linked cases

- **WHEN** a client requests a project's case list with `jiraLinked=true`
- **THEN** only cases with a non-null `jiraIssueKey` are returned, and no case content is scanned client-side to produce this result

