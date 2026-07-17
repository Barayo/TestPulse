## MODIFIED Requirements

### Requirement: Deleting a section cascades to its subtree
Deleting a section SHALL soft-delete that section and every section and test case anywhere in its subtree, rather than reparenting them. A soft-deleted section or case no longer appears in section listings, the section tree, or the project's case list, but its data (and, for a case, its version history) is preserved and remains visible wherever a run references it, matching the existing soft-deletion guarantee for individually deleted cases. The root section itself MUST NOT be deletable.

#### Scenario: Delete a section with cases
- **WHEN** a user deletes a section containing cases and having no subsections
- **THEN** every case in that section is soft-deleted and no longer appears in the project's case list

#### Scenario: Delete a section with nested subsections
- **WHEN** a user deletes a section that has one or more child sections, themselves containing cases
- **THEN** every descendant section and every case at any depth within the deleted section's subtree is soft-deleted

#### Scenario: A deleted section referenced by a run keeps history intact
- **WHEN** a section is deleted and one of its former cases appears in a past run
- **THEN** the run still shows the pinned case version content, same as when a case is deleted directly

#### Scenario: Root section cannot be deleted
- **WHEN** a user attempts to delete a project's root section
- **THEN** the request is rejected

## ADDED Requirements

### Requirement: Destructive actions require delete mode and confirmation
The web UI SHALL hide every delete affordance (case delete, section delete) behind an explicit "delete mode" toggle in the Library view, off by default each time the view is opened. The toggle itself SHALL only be visible to an actor whose effective project permissions include `caseDelete` or `sectionDelete`. Every delete action, once triggered, SHALL show a confirmation dialog stating what will be removed before it executes; for a section, the dialog states the number of cases and subsections in its subtree. Canceling the dialog SHALL make no change.

#### Scenario: Delete affordances are hidden until delete mode is enabled
- **WHEN** a user with delete permission opens the Library view without enabling delete mode
- **THEN** no delete button or selection control is shown on any section or case row

#### Scenario: Enabling delete mode reveals delete actions
- **WHEN** a user with delete permission toggles delete mode on
- **THEN** delete actions become available on section and case rows

#### Scenario: Delete mode is unavailable without delete permission
- **WHEN** a user whose effective project permissions include neither `caseDelete` nor `sectionDelete` opens the Library view
- **THEN** the delete mode toggle is not shown at all

#### Scenario: Deleting a section requires confirming its subtree size
- **WHEN** a user in delete mode triggers delete on a section containing cases and subsections
- **THEN** a confirmation dialog states how many cases and subsections will be removed before the deletion proceeds

#### Scenario: Canceling a delete confirmation makes no change
- **WHEN** a user triggers delete on a case or section and then cancels the confirmation dialog
- **THEN** no request is made and the case or section remains exactly as it was
