## ADDED Requirements

### Requirement: Self-service password recovery, gated on SMTP configuration
The system SHALL let a user with a real, active account request a password
reset email, and set a new password via a single-use, time-limited link,
entirely without administrator involvement. This capability SHALL be
available only when the instance has outbound email configured; when it is
not configured, the system SHALL behave exactly as if no user had ever
requested a reset — no partial/broken flow.

#### Scenario: Requesting a reset for a real, active account
- **WHEN** a user submits their email to the forgot-password endpoint, and
  an active account with that email exists, and the instance has SMTP
  configured
- **THEN** a single-use reset token is created (expiring in 30 minutes) and
  an email containing a reset link is sent to that address

#### Scenario: The response never reveals whether the account exists
- **WHEN** a forgot-password request is submitted for an email that does
  not exist, belongs to a deactivated account, or arrives while the
  instance has no SMTP configured
- **THEN** the response is identical (`200`) to the success case, and no
  email is sent

#### Scenario: Resetting the password with a valid token
- **WHEN** a user submits an unexpired, unused reset token together with a
  new password meeting the minimum strength requirement
- **THEN** the account's password is updated, the token is marked used, and
  every existing session for that account is revoked

#### Scenario: An expired or already-used token is rejected
- **WHEN** a user submits a reset token that has expired or was already
  used
- **THEN** the request is rejected and the password is unchanged

#### Scenario: A weak new password is rejected
- **WHEN** a user submits a valid reset token with a new password under 12
  characters
- **THEN** the request is rejected with a validation error, the token
  remains unused, and the password is unchanged

#### Scenario: Requesting a reset is rate-limited
- **WHEN** more than 5 forgot-password requests arrive from the same client
  within a minute (after an initial burst of 5)
- **THEN** further requests from that client are rejected with `429`

#### Scenario: The login page only offers recovery when it would actually work
- **WHEN** a user visits the login page
- **THEN** a "Forgot password?" link is shown only if the instance has SMTP
  configured; otherwise no such link is shown

#### Scenario: Instance metadata reports whether recovery is available
- **WHEN** any caller, authenticated or not, requests instance metadata
- **THEN** the response includes `passwordResetEnabled`, `true` only when
  every required SMTP and public-URL environment variable is set
