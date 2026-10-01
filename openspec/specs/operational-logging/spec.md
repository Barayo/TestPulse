## Purpose

The system's request paths and background processes — backend and
frontend alike — are traceable after the fact: every request that returns
an error is logged with a correlatable request ID, every background
process's failures are visible instead of silently discarded, and a
frontend crash or failed API call is logged server-side instead of
vanishing once the tab closes.

## Requirements

### Requirement: Every error HTTP response is logged with a correlatable request ID
Any HTTP response with status 400 or above SHALL produce a server-side
log line including the request's method, path, status code, and request
ID.

#### Scenario: A validation error is logged
- **WHEN** a request fails validation and returns 400
- **THEN** a log line is produced including the request's method, path,
  status, and request ID

#### Scenario: An unexpected internal error is logged
- **WHEN** a request fails with an unrecognized error and returns 500
- **THEN** a log line is produced at Error level including the request's
  method, path, status, and request ID

#### Scenario: A successful response is not logged by the request-logging middleware
- **WHEN** a request completes with a 2xx or 3xx status
- **THEN** no log line is produced by the request-logging middleware

### Requirement: The request ID is returned to the client
Every HTTP response SHALL include an `X-Request-Id` header carrying the
same request ID used in that request's server-side log lines.

#### Scenario: The response header matches the logged request ID
- **WHEN** any request completes, successfully or not
- **THEN** the response's `X-Request-Id` header value is present and
  identical to the request ID that would appear in that request's own log
  lines

### Requirement: A failed webhook delivery attempt is logged
When an outbound webhook delivery attempt fails (unreachable, timed out,
non-2xx response, or rejected by the dial-time SSRF check), it SHALL be
logged at Warn level, including the destination host and event type, and
SHALL NOT include the destination's full URL query string or the delivery
payload body.

#### Scenario: An unreachable destination is logged
- **WHEN** a webhook delivery attempt to an unreachable destination fails
- **THEN** a Warn-level log line is produced naming the destination host
  and the event type

#### Scenario: A successful delivery is not logged
- **WHEN** a webhook delivery attempt succeeds
- **THEN** no failure log line is produced for that attempt

### Requirement: A background worker's per-tick failure is logged
When `ProjectAutoArchiveWorker`, `RunRetentionWorker`, or
`ProjectDeletionWorker` encounters an error during a sweep/processing
tick, it SHALL log the failure at Warn level instead of discarding it
silently.

#### Scenario: A sweep failure is logged, not silently discarded
- **WHEN** a background worker's sweep or processing tick returns an error
- **THEN** a Warn-level log line is produced for that tick's failure, and
  the worker continues to its next scheduled tick unaffected

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
