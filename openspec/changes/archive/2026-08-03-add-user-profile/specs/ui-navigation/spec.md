## ADDED Requirements

### Requirement: User identity in the header links to the Profile page
The web UI's header SHALL show the authenticated user's avatar
alongside their email in the account menu trigger, and that menu SHALL
offer a Profile entry — the primary entry point into account settings.
(The header's account control had already evolved from plain email text
into a dropdown menu, offering API tokens and Log out, by a separate,
more recent change than the one that first proposed this requirement;
Profile joins that existing menu rather than the avatar itself becoming
a direct link.)

#### Scenario: Header shows the user's avatar
- **WHEN** an authenticated user views any page
- **THEN** their avatar (preset or generated default) is shown next to their email in the header's account menu trigger

#### Scenario: Opening the account menu offers Profile
- **WHEN** a user opens the header's account menu
- **THEN** it offers a Profile entry, alongside the existing API tokens and Log out entries, that navigates to the Profile page

#### Scenario: Profile page links to existing settings
- **WHEN** a user opens the Profile page
- **THEN** it links to the existing Tokens page, previously reachable only by typing its URL directly; it does not duplicate instance administration (People, Roles) even for an admin account, since that already has its own entry point in the top-level Admin menu and is not a personal-account concern

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
