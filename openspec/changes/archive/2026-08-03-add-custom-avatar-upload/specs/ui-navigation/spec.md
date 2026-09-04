## MODIFIED Requirements

### Requirement: Chosen avatar is shown everywhere a person's identity appears
A user's `Avatar` (preset, uploaded custom photo, or generated default)
SHALL render consistently anywhere their identity is shown in the web
UI, not only the header.

#### Scenario: Avatar appears on People, Project Members, and assignee surfaces
- **WHEN** a user has a preset avatar or a custom uploaded photo set
- **THEN** it is shown on PeoplePage, ProjectMembersPage, and wherever they appear as a run item's assignee

#### Scenario: A user-attributed result history entry shows that user's avatar
- **WHEN** a recorded result's `actorKind` is `user` and resolves to a real account
- **THEN** that account's current `Avatar` (preset, custom photo, or generated default) is shown next to the entry

#### Scenario: Agent, unknown, or overridden actors are unaffected
- **WHEN** a result's `actorKind` is `agent` or `unknown`, or the recorder used the "record on behalf of" free-text override
- **THEN** the entry keeps its existing plain-text treatment, with no avatar
