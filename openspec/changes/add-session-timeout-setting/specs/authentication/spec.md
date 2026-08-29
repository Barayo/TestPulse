## MODIFIED Requirements

### Requirement: Session-based login
The system SHALL authenticate a user's email and password against the stored bcrypt hash and, on success, create a server-side session and set an `HttpOnly`, `Secure`, `SameSite=Lax` cookie referencing it by opaque ID. The session expiry SHALL be a Tenant-Admin-configurable number of days from creation (`sessionTimeoutDays`, default 30, bounded 1–90), extended (sliding) on each authenticated request that uses it, using whatever value is currently configured at the time of creation or extension. When SSO-only mode is enabled (see `sso-oidc`), password-based login SHALL be rejected regardless of credentials; a session created via OIDC login uses this same mechanism and expiry.

#### Scenario: Successful login
- **WHEN** a user submits their correct email and password to
  `POST /api/v1/auth/login`
- **THEN** a session is created and the response sets a session cookie

#### Scenario: Wrong password is rejected
- **WHEN** a user submits an email with an incorrect password
- **THEN** the request is rejected with `401` and no session is created

#### Scenario: Logout invalidates the session
- **WHEN** an authenticated user calls `POST /api/v1/auth/logout`
- **THEN** the session is deleted and its cookie no longer authenticates
  subsequent requests

#### Scenario: Active use extends the session by the configured timeout
- **WHEN** a request authenticates successfully using a session with less
  than the currently-configured `sessionTimeoutDays` remaining before expiry
- **THEN** the session's expiry is pushed forward to `sessionTimeoutDays`
  from that request

#### Scenario: A Tenant Admin configures the session timeout
- **WHEN** a Tenant Admin sets `sessionTimeoutDays` to a value between 1 and 90 via the instance settings update endpoint
- **THEN** the new value is saved and used for sessions created or extended from that point on

#### Scenario: Out-of-bounds timeout values are rejected
- **WHEN** a Tenant Admin attempts to set `sessionTimeoutDays` to less than 1 or more than 90
- **THEN** the request is rejected with a validation error and the setting is unchanged

#### Scenario: Changing the timeout does not affect already-active sessions
- **WHEN** a Tenant Admin changes `sessionTimeoutDays` while other sessions are already active
- **THEN** those sessions keep their existing expiry until they are next extended or expire naturally, rather than being immediately shortened or extended
