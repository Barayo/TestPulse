## ADDED Requirements

### Requirement: Folder URLs are slug-path based, not UUID based
The system SHALL address a folder in its browser URL by a slash-separated
path of slugified ancestor folder names (`/projects/{projectKey}/library/
{slug}/{slug}/...`), derived from each folder's `name`, rather than by its
internal UUID. The REST API SHALL continue to address folders by UUID
(`/api/v1/folders/{folderId}`) — this requirement governs the browser URL
only, not the API contract.

#### Scenario: Navigating to a folder shows a slug-path URL
- **WHEN** a user navigates to a folder named "Two-Factor" nested under a folder named "Authentication"
- **THEN** the browser URL is `/projects/{projectKey}/library/authentication/two-factor`, not a UUID

#### Scenario: A slug-path URL resolves to the correct folder
- **WHEN** a user loads `/projects/{projectKey}/library/authentication/two-factor` directly (e.g. from a bookmark)
- **THEN** the page shows the "Two-Factor" folder nested under "Authentication"

### Requirement: A folder name that produces no usable slug is rejected
The system SHALL reject creating or moving a folder into a name whose
derived slug (after Unicode NFKC normalization and transliteration) is
empty, with a clear error, rather than silently assigning a fallback or
meaningless slug.

#### Scenario: A name with no slugifiable characters is rejected
- **WHEN** a user attempts to create a folder whose name consists entirely of characters that produce an empty slug (e.g. emoji or punctuation only)
- **THEN** the request is rejected with a clear error, and no folder is created

### Requirement: Sibling folder slugs must be unique
The system SHALL reject creating a folder, or moving a folder into a new
parent, whose derived slug would collide with a sibling folder's slug
under that same parent, in the same project. This applies even when the
two folders' display names differ but slugify identically (including pure
case variance), and even when the colliding slug is not currently live but
still reserved as another folder's redirect target (see the redirect
requirement below).

#### Scenario: Creating a folder with a name matching a sibling is rejected
- **WHEN** a user creates a folder named "Auth" inside a parent that already has a child folder named "Auth"
- **THEN** the request is rejected with a clear error, and no new folder is created

#### Scenario: Moving a folder into a slug collision is rejected
- **WHEN** a user moves a folder into a new parent that already has a child folder whose slug matches the moved folder's slug
- **THEN** the move is rejected and the folder's location is unchanged

#### Scenario: Names that differ but slugify identically are still rejected
- **WHEN** a user creates a folder named "Two Factor" inside a parent that already has a child folder named "Two-Factor"
- **THEN** the request is rejected, since both names produce the same slug

#### Scenario: Names that differ only by case are still rejected
- **WHEN** a user creates a folder named "auth" inside a parent that already has a child folder named "Auth"
- **THEN** the request is rejected, since both names produce the same slug

#### Scenario: Same name is allowed under different parents
- **WHEN** a user creates a folder named "Settings" under two different parent folders in the same project
- **THEN** both folders are created successfully, since uniqueness is scoped per parent

#### Scenario: Moving a folder back to a parent it previously occupied succeeds
- **WHEN** a user moves a folder away from a parent and then moves that same folder back to that same parent
- **THEN** the second move succeeds — the folder's own leftover reserved-slug record from the first move does not block it from reclaiming its own former spot

### Requirement: A folder's most recent prior slug-path redirects once after a move
When a folder is moved to a new parent, the system SHALL remember its
immediately-previous slug and parent (a single prior identity, not a full
history). A slug-path that fails to resolve against the current folder
tree SHALL be retried against these previous-identity values; on a match,
the browser SHALL be redirected to the folder's current slug-path. A slug
that is still reserved as another folder's redirect target SHALL NOT be
reusable by a different folder (see the sibling-uniqueness requirement) —
this guarantees a redirect always lands on the folder that was actually
moved, never a different folder that later reclaimed the same name.

#### Scenario: A bookmarked URL still resolves after one move
- **WHEN** a folder is moved from one parent to another
- **AND** a user loads the folder's old slug-path URL
- **THEN** the browser is redirected to the folder's new slug-path URL, and a one-shot confirmation banner explains it moved

#### Scenario: A URL surviving two moves is not found
- **WHEN** a folder is moved twice in succession
- **AND** a user loads the slug-path URL from before the *first* move
- **THEN** the folder is not found (only the single most recent prior identity is remembered)

#### Scenario: A redirected URL does not re-show the banner on reload
- **WHEN** a user's browser has already been redirected to a folder's current slug-path (the URL bar now shows the live path)
- **AND** the user reloads the page
- **THEN** the folder loads via a plain live match, and the one-shot confirmation banner does not reappear

### Requirement: An unresolvable slug-path shows a clear not-found state
A slug-path that cannot be resolved against either the live tree or any
folder's previous identity SHALL show a distinct not-found state with a
link back to the project's Library, distinguishable from the existing
"project not found" state.

#### Scenario: A malformed or nonexistent slug-path is not found
- **WHEN** a user loads a slug-path URL containing a segment that matches no live or previous folder slug at that position (including an empty segment from a trailing or doubled slash)
- **THEN** the page shows "Section not found" with a link back to the Library, not a blank page or crash
