## ADDED Requirements

### Requirement: A frontend render crash is logged
The system SHALL provide an authenticated `POST /api/v1/client-errors` endpoint accepting a structured error report, and the web app SHALL wrap its component tree in an error boundary that reports any render crash it catches to this endpoint, including the error message, stack trace, and React component stack. The server SHALL log the report at Warn level instead of persisting it, including the resolved actor when available.

#### Scenario: A render crash is caught and reported
- **WHEN** a component throws during render
- **THEN** the error boundary catches it, shows a fallback UI instead of a blank screen, and reports the crash to `POST /api/v1/client-errors`

#### Scenario: A crash report produces a server-side log line
- **WHEN** the server receives a crash report
- **THEN** a Warn-level log line is produced including the error message and, when available, the resolved actor

### Requirement: A failed frontend API call is logged
Every API call made through the web app's shared API client SHALL be reported to `POST /api/v1/client-errors` when it fails, whether due to an HTTP response with status 400 or above or a network-level failure — independent of how the calling code itself handles the failure.

#### Scenario: A failed API call is reported regardless of call-site handling
- **WHEN** an API call made through the shared client receives a response with status 400 or above
- **THEN** the failure is reported to `POST /api/v1/client-errors`, including the method, path, and status, whether or not the calling code inspects the response's error field

#### Scenario: A network-level failure is reported
- **WHEN** an API call made through the shared client fails at the network level (e.g. the client is offline)
- **THEN** the failure is reported to `POST /api/v1/client-errors` without a status code

#### Scenario: Reporting a failure never recurses on itself
- **WHEN** a request to `POST /api/v1/client-errors` itself fails
- **THEN** that failure is not itself reported
