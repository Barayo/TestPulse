## ADDED Requirements

### Requirement: User deletion is Tenant-Admin-gated and requires deactivation first
The system SHALL let a Tenant Admin permanently delete a user account, gated by Tenant Admin status alone (the same instance-wide gate as creating, deactivating, or reactivating a user, or changing a user's Tenant Admin flag) — not a project-scoped permission flag, since a user account is not scoped to any single project. Deletion SHALL only be permitted once the target account is already deactivated, and a Tenant Admin SHALL NOT be able to delete their own account, even if it is deactivated.

#### Scenario: Tenant Admin deletes a deactivated user
- **WHEN** a Tenant Admin deletes a user account that is already deactivated
- **THEN** the account and every row that cascades from it (team memberships, project memberships, sessions, API tokens) are permanently removed

#### Scenario: Cannot delete an active user
- **WHEN** a Tenant Admin attempts to delete a user account that is not deactivated
- **THEN** the request is rejected with a validation error, and the account is untouched — a user must be deactivated first

#### Scenario: Cannot delete your own account
- **WHEN** a Tenant Admin attempts to delete their own user account, whether or not it is deactivated
- **THEN** the request is rejected, enforced server-side, regardless of what the UI shows

#### Scenario: Non-Tenant-Admin cannot delete a user
- **WHEN** a user without Tenant Admin status attempts to delete any user account, including their own
- **THEN** the request is rejected and no account is deleted

#### Scenario: Deleting a user does not affect the audit log or run results
- **WHEN** a user account is deleted
- **THEN** every audit log entry and test run result that recorded that user as an actor is untouched — both store actor identity as free text, not a reference to the user account
