## MODIFIED Requirements

### Requirement: Self-service profile
An authenticated user SHALL be able to view and update their own display
name, avatar, and timezone, independent of the admin-only user
management capability that manages other users' role and deactivation
status. Avatar is either a preset key, an uploaded custom photo, or
unset.

#### Scenario: Updating display name and timezone
- **WHEN** a user submits a new display name and/or timezone for their own account
- **THEN** the account is updated and the new values are reflected wherever the user's identity is shown

#### Scenario: Choosing a preset avatar
- **WHEN** a user selects one of the preset avatars
- **THEN** their account records that avatar's key, and it replaces the generated default (or any previously uploaded custom photo) wherever their identity is shown

#### Scenario: Uploading a custom photo avatar
- **WHEN** a user uploads a JPEG, PNG, or WebP image no larger than 500KB
- **THEN** the server validates and center-crops/resizes it to a standard square size, stores it, and it replaces the generated default (or any preset selection) wherever their identity is shown

#### Scenario: Uploaded file fails validation
- **WHEN** a user uploads a file that is not a valid JPEG/PNG/WebP image, or exceeds the 500KB size cap
- **THEN** the upload is rejected with an error and the user's existing avatar (if any) is unchanged

#### Scenario: Removing a custom photo avatar
- **WHEN** a user with a custom photo avatar removes it
- **THEN** the stored image is deleted and a generated initial-on-color avatar is shown instead, the same as if no avatar had ever been set

#### Scenario: No avatar selected shows a generated default
- **WHEN** a user has not selected a preset avatar or uploaded a custom photo
- **THEN** a generated initial-on-color avatar is shown instead, derived from their display name (or email) and user id, requiring no stored image

#### Scenario: A user cannot edit another user's profile
- **WHEN** a user attempts to update display name, avatar, or timezone for an account that is not their own
- **THEN** the request is rejected — self-service profile editing is scoped to the authenticated user's own account only

#### Scenario: A user cannot upload or remove another user's avatar
- **WHEN** a user attempts to upload or remove a custom avatar for an account that is not their own
- **THEN** the request is rejected — the same scoping as every other self-service profile edit
