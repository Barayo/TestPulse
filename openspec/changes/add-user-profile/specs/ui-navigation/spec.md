## ADDED Requirements

### Requirement: User identity in the header links to the Profile page
The web UI's header SHALL show the authenticated user's avatar in place
of their raw email, and it SHALL link to the Profile page — the primary
entry point into account settings.

#### Scenario: Header shows the user's avatar
- **WHEN** an authenticated user views any page
- **THEN** their avatar (preset or generated default) is shown in the header instead of their email address

#### Scenario: Clicking the avatar opens the Profile page
- **WHEN** a user clicks their avatar in the header
- **THEN** they are taken to the Profile page

#### Scenario: Profile page links to existing settings
- **WHEN** a user opens the Profile page
- **THEN** it links to the existing Tokens page, and to the Users page if the account is an admin — both previously reachable only by typing their URL directly

### Requirement: Chosen avatar is shown everywhere a person's identity appears
A user's `Avatar` (preset or generated default) SHALL render
consistently anywhere their identity is shown in the web UI, not only
the header.

#### Scenario: Avatar appears on People, Project Members, and assignee surfaces
- **WHEN** a user has a preset avatar set
- **THEN** it is shown on PeoplePage, ProjectMembersPage, and wherever they appear as a run item's assignee

#### Scenario: A user-attributed result history entry shows that user's avatar
- **WHEN** a recorded result's `actorKind` is `user` and resolves to a real account
- **THEN** that account's current `Avatar` is shown next to the entry

#### Scenario: Agent, unknown, or overridden actors are unaffected
- **WHEN** a result's `actorKind` is `agent` or `unknown`, or the recorder used the "record on behalf of" free-text override
- **THEN** the entry keeps its existing plain-text treatment, with no avatar
