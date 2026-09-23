## ADDED Requirements

### Requirement: Configuring project webhook destinations
A user with `manageProject` permission on a project (or a Tenant Admin)
SHALL be able to add, list, and remove webhook destinations for that
project. A project MAY have zero, one, or multiple configured
destinations simultaneously.

#### Scenario: Add a webhook destination
- **WHEN** a user with `manageProject` permission submits a new HTTPS
  webhook URL for their project
- **THEN** the destination is saved and appears in the project's list of
  configured destinations

#### Scenario: A project can have multiple destinations
- **WHEN** a project already has one webhook destination configured and
  a user with `manageProject` permission adds a second, different URL
- **THEN** both destinations are retained and both receive future
  triggered events independently

#### Scenario: Remove a webhook destination
- **WHEN** a user with `manageProject` permission removes a previously
  configured destination
- **THEN** it no longer appears in the project's list and no longer
  receives triggered events

#### Scenario: A user without manageProject cannot configure webhooks
- **WHEN** a user whose effective permissions on a project do not
  include `manageProject` attempts to add or remove a webhook
  destination
- **THEN** the request is rejected with `403`

### Requirement: Webhook URLs are validated against unsafe destinations
The system SHALL reject a webhook destination URL that is not `https://`,
or that resolves to a localhost, private, or link-local address, at the
time it is configured — preventing the server from being used to make
arbitrary outbound requests to internal infrastructure.

#### Scenario: A non-HTTPS URL is rejected
- **WHEN** a user submits a webhook destination URL using `http://`
  instead of `https://`
- **THEN** the request is rejected with a validation error, and no
  destination is saved

#### Scenario: A localhost or private-network URL is rejected
- **WHEN** a user submits a webhook destination URL pointing to
  `localhost`, a `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`, or link-local address
- **THEN** the request is rejected with a validation error, and no
  destination is saved

### Requirement: A failed or blocked result triggers configured webhooks
When a result is recorded with verdict `failed` or `blocked` on a
project with one or more configured webhook destinations, the system
SHALL attempt delivery of a `result.failed`/`result.blocked` event to
every configured destination for that project.

#### Scenario: Recording a failed result fires configured webhooks
- **WHEN** a result with verdict `failed` is recorded on a run item in a
  project with a configured webhook destination
- **THEN** the system attempts an HTTP POST to that destination with a
  `result.failed` event payload

#### Scenario: Recording a passing result does not fire webhooks
- **WHEN** a result with verdict `pass`, `skipped`, or `retest` is
  recorded
- **THEN** no webhook delivery is attempted for that result

#### Scenario: A project with no configured destinations triggers no delivery
- **WHEN** a failed result is recorded on a project with zero configured
  webhook destinations
- **THEN** no outbound HTTP request is made

### Requirement: A run closing triggers configured webhooks
When a run closes on a project with one or more configured webhook
destinations, the system SHALL attempt delivery of a `run.closed` event
to every configured destination for that project, regardless of the
run's final pass rate.

#### Scenario: Closing a run fires configured webhooks
- **WHEN** a run in a project with a configured webhook destination is
  closed
- **THEN** the system attempts an HTTP POST to that destination with a
  `run.closed` event payload

#### Scenario: A fully-passing run close still fires webhooks
- **WHEN** a run with a 100% pass rate is closed
- **THEN** the `run.closed` event still fires — delivery is not
  conditioned on the run containing a failure

### Requirement: Webhook delivery never blocks or fails the triggering write
A webhook destination being unreachable, slow, or returning a non-2xx
response SHALL NOT block, delay beyond a short bounded timeout, or cause
an error response for the result-recording or run-closing request that
triggered it.

#### Scenario: An unreachable webhook does not fail the recording request
- **WHEN** a result is recorded with verdict `failed` and the project's
  configured webhook destination is unreachable
- **THEN** the result is still recorded successfully, and the API
  response reflects that success, not a delivery failure

#### Scenario: A slow webhook does not block the response indefinitely
- **WHEN** a configured webhook destination does not respond within a
  short bounded timeout
- **THEN** the system gives up on that delivery attempt and the
  triggering request completes without waiting further

### Requirement: Webhook payload is a stable, minimal event envelope
Every webhook delivery SHALL carry a JSON body containing the event
type, the project's key, the triggering entity's key and a
human-readable title, and a timestamp — not a full dump of the
underlying domain object.

#### Scenario: Payload contains the required envelope fields
- **WHEN** any webhook event is delivered
- **THEN** its JSON body includes at minimum an event type, the
  project key, an entity key, a human-readable title, and an ISO 8601
  timestamp
