## ADDED Requirements

### Requirement: Session expiry mid-use prompts re-login without losing place
If an authenticated user's session becomes invalid while they are actively using the web app (any request receives `401` after a session was already established), the UI SHALL present a non-dismissable login modal over the current view rather than navigating away or rendering an empty/broken state. The modal SHALL state why it appeared (e.g. "Your session has expired. Log back in to continue where you left off.") rather than presenting an unexplained login form. The modal SHALL NOT be closable except by successfully re-authenticating (no close button, no Escape, no click-outside dismissal). A `401` from the login or logout endpoints themselves SHALL NOT trigger this modal — a wrong-password attempt inside the modal must not re-trigger itself, and a user explicitly logging out of an already-invalid session must land cleanly on `/login`, not this modal. A `401` received before any session has been established (first load) SHALL continue to be handled by the existing redirect-to-`/login` behavior and SHALL NOT also trigger this modal. The modal SHALL pre-fill the email of the previously-authenticated user, with focus starting in the password field rather than email, but SHALL allow the email to be changed so a different account can log in instead. Errors on re-authentication (e.g. wrong password) SHALL be shown inline in the modal, not as a toast.

On successful re-authentication, the app SHALL reload rather than resume in place, since data already held in memory may belong to a different session: if the newly-authenticated user is the same as before, the app SHALL reload the current URL; if it is a different user, the app SHALL navigate to the home route instead of the current URL.

#### Scenario: A 401 after an established session opens the modal
- **WHEN** an authenticated user's session expires and a subsequent request returns `401`
- **THEN** a non-dismissable login modal appears over the current view, and the underlying URL does not change

#### Scenario: A first-load 401 does not trigger the modal
- **WHEN** an unauthenticated visitor's very first request (before any session was established) receives `401`
- **THEN** the existing redirect to `/login` occurs, and the session-expiry modal is not shown

#### Scenario: The modal cannot be dismissed without logging in
- **WHEN** the session-expiry modal is open
- **THEN** pressing Escape, clicking outside the modal, or looking for a close button has no effect — the modal stays open until re-authentication succeeds

#### Scenario: The email field is pre-filled but editable, and focus starts on password
- **WHEN** the session-expiry modal opens
- **THEN** the email field contains the previously-authenticated user's email and can be changed before submitting, and keyboard focus starts in the password field

#### Scenario: A wrong-password attempt inside the modal does not re-trigger it
- **WHEN** a user submits an incorrect password from within the session-expiry modal
- **THEN** the login request's own `401` shows an inline error and does not cause the modal to close, reopen, or otherwise re-fire

#### Scenario: Logging out of an already-expired session lands on /login, not this modal
- **WHEN** a user clicks "Log out" and the logout request itself receives `401` because the session was already invalid
- **THEN** the session-expiry modal does not appear and the user lands on `/login` as a normal logout would

#### Scenario: Re-authenticating as the same user resumes the same view
- **WHEN** the session-expiry modal's login succeeds and the authenticated user is the same as before the expiry
- **THEN** the app reloads the current URL

#### Scenario: Re-authenticating as a different user goes home
- **WHEN** the session-expiry modal's login succeeds as a different user than was previously authenticated
- **THEN** the app navigates to the home route instead of the URL that was open when the session expired

#### Scenario: A failed re-authentication attempt shows an inline error
- **WHEN** the session-expiry modal's login submission fails (e.g. wrong password)
- **THEN** an inline error message appears in the modal and it remains open
