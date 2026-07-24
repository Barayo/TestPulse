## MODIFIED Requirements

### Requirement: Per-user project favorites
The system SHALL let any user with an effective role on a project (Tester or above), or a Tenant Admin, star and unstar it. A project's favorite status is per-user — one user starring a project SHALL NOT affect whether it appears starred for any other user.

#### Scenario: Starring a project
- **WHEN** a user stars a project they have an effective role on
- **THEN** the project is marked as favorited for that user

#### Scenario: Unstarring a project
- **WHEN** a user unstars a project they had previously starred
- **THEN** the project is no longer marked as favorited for that user

#### Scenario: Favorites are per-user, not shared
- **WHEN** user A stars a project that user B has not starred
- **THEN** the project shows as favorited for user A and not for user B

#### Scenario: Favorite state included in the project summaries response
- **WHEN** an authenticated user requests `GET /api/v1/projects/summaries`
- **THEN** each entry indicates whether that project is one of the caller's favorites, without a separate request

#### Scenario: User with no membership cannot star a project
- **WHEN** a user with no effective role on a project and who is not a Tenant Admin attempts to star it
- **THEN** the request is rejected with `403`
