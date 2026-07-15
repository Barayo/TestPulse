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
