## ADDED Requirements

### Requirement: Self-service profile
An authenticated user SHALL be able to view and update their own display
name, avatar, and timezone, independent of the admin-only user
management capability that manages other users' role and deactivation
status.

#### Scenario: Updating display name and timezone
- **WHEN** a user submits a new display name and/or timezone for their own account
- **THEN** the account is updated and the new values are reflected wherever the user's identity is shown

#### Scenario: Choosing a preset avatar
- **WHEN** a user selects one of the preset avatars
- **THEN** their account records that avatar's key, and it replaces the generated default wherever their identity is shown

#### Scenario: No avatar selected shows a generated default
- **WHEN** a user has not selected a preset avatar
- **THEN** a generated initial-on-color avatar is shown instead, derived from their display name (or email) and user id, requiring no stored image

#### Scenario: A user cannot edit another user's profile
- **WHEN** a user attempts to update display name, avatar, or timezone for an account that is not their own
- **THEN** the request is rejected — self-service profile editing is scoped to the authenticated user's own account only
