## ADDED Requirements

### Requirement: Shared tag vocabulary

The system SHALL maintain a single, deduplicated tag vocabulary shared across all projects, keyed by a normalized (lowercase) tag name — assigning a tag name that already exists in the vocabulary SHALL reuse it, never create a duplicate.

#### Scenario: Assigning an existing tag name reuses it

- **WHEN** a tag named "mobile" already exists and a user assigns "mobile" to a second project
- **THEN** both projects reference the same tag, and the vocabulary still contains exactly one "mobile" entry

#### Scenario: Tag names are case-insensitive

- **WHEN** a tag "Mobile" already exists and a user assigns "mobile" to a project
- **THEN** the project is tagged with the existing "Mobile"/"mobile" entry, not a new one

#### Scenario: Assigning a new tag name creates it

- **WHEN** a user assigns a tag name that does not yet exist in the vocabulary
- **THEN** the vocabulary gains a new entry for that name, and the project is tagged with it

### Requirement: Per-project tag assignment at the favorites permission bar

Any user with `read` permission on a project, or a Tenant Admin, SHALL be able to assign and remove tags on that project — the same permission bar as starring a project. A tag's assignment is shared project state, not per-user.

#### Scenario: Assigning a tag to a project

- **WHEN** a user with `read` permission on a project assigns a tag to it
- **THEN** the project is tagged, and the tag is visible to every user who can view that project

#### Scenario: Removing a tag from a project

- **WHEN** a user with `read` permission on a project removes a tag that another user previously assigned
- **THEN** the tag is no longer associated with that project, for every viewer

#### Scenario: User with no permission on a project cannot tag it

- **WHEN** a user with no `read` permission on a project and who is not a Tenant Admin attempts to assign a tag to it
- **THEN** the request is rejected with `403`

#### Scenario: Removing a project's last use of a tag keeps the tag in the vocabulary

- **WHEN** a tag is removed from the only project that had it assigned
- **THEN** the tag remains in the shared vocabulary, available to assign to any project

### Requirement: Tag state included in the project summaries response

`GET /api/v1/projects/summaries` SHALL include each project's assigned tag names, without requiring a separate request per project.

#### Scenario: Summaries include tags

- **WHEN** an authenticated user requests `GET /api/v1/projects/summaries`
- **THEN** each entry includes the list of tag names assigned to that project

#### Scenario: Untagged project has an empty tag list

- **WHEN** a project has no tags assigned
- **THEN** its summary entry's tag list is empty, not null and not an error

#### Scenario: Request count stays constant as tag usage grows

- **WHEN** the number of tagged projects increases
- **THEN** a client fetching all project summaries still makes exactly one HTTP request
