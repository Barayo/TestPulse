## ADDED Requirements

### Requirement: Project-scoped custom field definitions
The system SHALL let a user with `manageProject` permission on a project
define custom fields scoped to that project: each field has a name and a
type, either `text` (free text) or `select` (a closed, admin-defined list
of options). A field's type SHALL be fixed at creation and SHALL NOT be
changeable afterward. A field's name SHALL be renamable at any time. Any
user with `read` permission on the project (and an anonymous visitor to a
public project, via the public equivalent) MAY list the project's defined
fields. Deleting a field definition SHALL require `manageProject`
permission and SHALL be gated behind a preview showing how many of the
project's current cases have a value set for it.

#### Scenario: A text field is defined
- **WHEN** a Project Admin creates a custom field named "Automation Owner"
  with type `text`
- **THEN** the field appears in the project's field list with no options

#### Scenario: A select field is defined with options
- **WHEN** a Project Admin creates a custom field named "Component" with
  type `select` and options "API", "Web", "Mobile"
- **THEN** the field appears with those three options in the order given

#### Scenario: A field's type cannot change after creation
- **WHEN** a Project Admin attempts to change an existing field's type
  from `text` to `select`
- **THEN** the request is rejected — only the field's name is editable

#### Scenario: A user without manageProject cannot define fields
- **WHEN** a user whose effective permissions on a project do not include
  `manageProject` attempts to create, rename, or delete a custom field
- **THEN** the request is rejected with `403`

#### Scenario: Deleting a field shows how many cases are affected
- **WHEN** a Project Admin requests the deletion preview for a field that
  12 of the project's current cases have a value set for
- **THEN** the preview reports a count of 12, before any deletion happens

#### Scenario: Public visitor reads a public project's field definitions
- **WHEN** an anonymous visitor requests the custom field definitions for
  a project configured for anonymous access
- **THEN** the same field list is returned via the public endpoint,
  without requiring authentication

### Requirement: Reordering field definitions and their options
The system SHALL let a user with `manageProject` permission set the
display order of a project's custom fields, and independently set the
display order of a single select field's options. The web UI SHALL offer
drag-and-drop reordering via a grip handle as the primary interaction, and
an equivalent non-drag "Move up"/"Move down" action reachable from each
row's own action menu, disabled at the first/last position respectively —
both SHALL produce the identical resulting order.

#### Scenario: Fields are reordered
- **WHEN** a Project Admin moves a field from third position to first
- **THEN** subsequent reads of the project's field list return it first,
  and every other field's relative order is otherwise unchanged

#### Scenario: A select field's options are reordered independently of the field list
- **WHEN** a Project Admin reorders "Component"'s options
- **THEN** the project's overall field order is unaffected

#### Scenario: The non-drag fallback produces the same result as dragging
- **WHEN** a user without pointer-drag capability uses "Move up" to move a
  field one position earlier
- **THEN** the resulting order is identical to what dragging it there
  would have produced

### Requirement: Custom field values on case content
A test case's content MAY carry a value for any of its project's defined
custom fields, keyed by the field's identity (not its name), so a later
field rename does not orphan existing values. A `select` field's value
SHALL be one of that field's currently-defined options. Recording a value
for a field or option that does not exist on the case's project SHALL be
rejected. A case version created before a field existed, or one that
never had a value set for it, SHALL be treated as unset for that field —
not an error, not a default value.

#### Scenario: A value is recorded for a text field
- **WHEN** a user with `caseEdit` permission sets "Automation Owner" to
  "ana" while editing a case
- **THEN** the resulting version's content includes that value keyed by
  the field's id

#### Scenario: A select field's value must be a defined option
- **WHEN** a user attempts to set a `select` field to a value that is not
  one of its currently-defined options
- **THEN** the edit is rejected

#### Scenario: An unset field renders as absent, not a default
- **WHEN** a case version has no recorded value for a defined custom field
- **THEN** the field reads back as unset rather than any implied default

### Requirement: Deleting a field definition does not rewrite history
Deleting a custom field definition (or one of a select field's options)
SHALL NOT modify any existing case version's recorded content — past
versions keep whatever value they had, immutably, matching how test case
versioning already treats every other field. Rendering (including the
case detail sidebar and version-history diff) SHALL resolve field and
option identity against the project's *current* definitions only; a
reference to a since-deleted field or option SHALL render as unset rather
than erroring or showing stale label text.

#### Scenario: A deleted field's historical value is not shown
- **WHEN** a custom field is deleted after several case versions recorded
  values for it
- **THEN** the case's current view and its version-history diff no longer
  reference that field, even for versions created while it existed

#### Scenario: A deleted option's historical value renders as unset
- **WHEN** a select field's option is deleted after being recorded as a
  value on a past case version
- **THEN** that version's value for the field renders as unset rather
  than showing the removed option's stale text
