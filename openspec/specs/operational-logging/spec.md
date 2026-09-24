## Purpose

The backend's request paths and background processes are traceable after
the fact: every request that returns an error is logged with a
correlatable request ID, and every background process's failures are
visible instead of silently discarded.

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
