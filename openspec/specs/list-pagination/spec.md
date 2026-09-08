# list-pagination

## Purpose

Bounding the response size and query cost of the platform's high-growth
list endpoints — run history, run items, users, teams, roles, cases,
folders, suites — regardless of how large the underlying table grows,
via one consistent cursor-pagination contract (envelope shape, cursor
semantics, limit defaults/clamping, ordering) shared across all of them,
so the web app and MCP tools need only one client-side pagination pattern
(`add-cursor-pagination`).

## Requirements

### Requirement: Cursor-paginated response envelope
`GET /projects/{projectKey}/runs`, `GET /runs/{runKey}/items`,
`GET /users`, `GET /teams`, `GET /roles`,
`GET /projects/{projectKey}/cases`, `GET /projects/{projectKey}/folders`,
and `GET /projects/{projectKey}/suites` SHALL always return a JSON object
`{ items: [...], nextCursor: string | null }` — never a bare array. This
applies unconditionally, regardless of whether the request supplied
`cursor` or `limit`.

#### Scenario: A list response is wrapped, not a bare array
- **WHEN** an authenticated actor with read access calls any of the eight
  affected endpoints, with no query parameters
- **THEN** the response body is a JSON object with `items` and
  `nextCursor` keys, not a top-level JSON array

#### Scenario: The last page has a null nextCursor
- **WHEN** a request's page includes the last row in the underlying
  ordered set
- **THEN** the response's `nextCursor` is `null`

#### Scenario: A non-final page has a non-null nextCursor
- **WHEN** a request's page does not include the last row in the
  underlying ordered set
- **THEN** the response's `nextCursor` is a non-empty string that, when
  passed back as the `cursor` query parameter, resumes immediately after
  the last item in the current page

### Requirement: Opaque, replay-only cursor tokens
A `nextCursor` value SHALL be treated as opaque by clients: never
constructed or decoded by a client, only ever passed back verbatim as the
`cursor` query parameter of the same endpoint that issued it. The cursor
SHALL encode enough information (each affected table's `created_at` and
`id` columns) to resume ordering deterministically, including when
multiple rows share the same `created_at` value.

#### Scenario: An unmodified cursor resumes correctly
- **WHEN** a client passes a `cursor` value exactly as received from a
  prior response's `nextCursor`
- **THEN** the returned page begins with the item immediately after the
  last item of the page that produced that cursor, with no gap or overlap

#### Scenario: Rows sharing the same created_at are still ordered deterministically
- **WHEN** two or more rows in the underlying table have an identical
  `created_at` value
- **THEN** paginating across them yields each row exactly once, in a
  stable, deterministic order, across repeated requests

#### Scenario: A malformed or unrecognized cursor is rejected
- **WHEN** a request supplies a `cursor` value that is not a cursor this
  endpoint issued (malformed encoding, or well-formed but referencing a
  different endpoint's data shape)
- **THEN** the request is rejected with `400` rather than silently
  returning an arbitrary or empty page

### Requirement: Limit defaults to 50 and clamps to a maximum of 200
Every affected endpoint SHALL accept an optional `limit` query parameter.
Omitting it SHALL default to 50. Supplying a value greater than 200 SHALL
be silently clamped to 200, not rejected. Supplying a non-positive value
SHALL be treated as if `limit` were omitted (the default applies).

#### Scenario: Omitting limit uses the default
- **WHEN** a request to any of the eight affected endpoints omits the
  `limit` query parameter
- **THEN** the response contains at most 50 items

#### Scenario: An oversized limit is clamped, not rejected
- **WHEN** a request supplies `limit=999999`
- **THEN** the request succeeds and the response contains at most 200
  items, not an error

#### Scenario: A non-positive limit falls back to the default
- **WHEN** a request supplies `limit=0` or a negative value
- **THEN** the response behaves as if `limit` were omitted (at most 50
  items)

### Requirement: Each endpoint preserves its pre-existing ordering, now with a deterministic tiebreak
Introducing pagination SHALL NOT change any affected endpoint's existing
item order. `GET /projects/{projectKey}/runs` SHALL continue ordering
`created_at` descending (newest first) — its order prior to this change.
Every other affected endpoint (`GET /runs/{runKey}/items`, `GET /users`,
`GET /teams`, `GET /roles`, `GET /projects/{projectKey}/cases`, `GET
/projects/{projectKey}/folders`, `GET /projects/{projectKey}/suites`)
SHALL continue ordering `created_at` ascending (insertion order) — their
order prior to this change, with `GET /roles` additionally ordering by
`rank` first, as it already did. Every endpoint SHALL add `id` as a
deterministic tiebreaker (ascending or descending to match its base
order), so pagination never gaps or duplicates a row when multiple rows
share the same `created_at`.

#### Scenario: Runs stay newest-first
- **WHEN** a client requests the first page of `GET
  /projects/{projectKey}/runs` with no cursor
- **THEN** the first item in the response is the most recently created
  run visible to the requesting actor

#### Scenario: Every other affected endpoint stays in insertion order
- **WHEN** a client requests the first page of any affected endpoint other
  than `GET /projects/{projectKey}/runs`, with no cursor
- **THEN** the first item in the response is the earliest-created (first
  added) row visible to the requesting actor, not the most recent

#### Scenario: Roles preserve rank ordering ahead of creation time
- **WHEN** a client requests `GET /roles`
- **THEN** items are ordered by rank first, then by creation time within
  the same rank, exactly as before pagination was introduced

### Requirement: Internal callers needing the complete result set are unaffected
The introduction of cursor pagination on these eight HTTP-facing list
paths SHALL NOT change the behavior, signature, or response of any
internal (non-HTTP) code path that requires the complete, unbounded result
set.

#### Scenario: Setup-wizard existence checks still see every user
- **WHEN** the system checks whether any user account exists yet (ahead of
  first-run setup), regardless of how many user accounts exist
- **THEN** the check correctly considers every existing user account, not
  just the first page

#### Scenario: Resetting roles to defaults still finds every seeded role
- **WHEN** a Tenant Admin resets roles to their factory defaults
- **THEN** the operation locates all three seeded roles (Tester,
  Contributor, Project Admin) by name, regardless of how many other roles
  exist in the instance

#### Scenario: Run comparison still sees both runs' complete item sets
- **WHEN** an actor compares two runs
- **THEN** the comparison is computed against every item in both runs, not
  just their first page
