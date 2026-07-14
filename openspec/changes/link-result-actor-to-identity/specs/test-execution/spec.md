## MODIFIED Requirements

### Requirement: Append-only result log
Each run item SHALL have an append-only result log. A result records an
actor, verdict (`pass`, `failed`, `skipped`, `blocked`), optional comment,
and timestamp. Results MUST NOT be editable or deletable through the API.

The actor SHALL default to the authenticated caller who recorded the
result; a client MAY still explicitly supply an `actor` display name to
override it (e.g. an agent recording a result on behalf of a named human
tester). Regardless of an override, the result SHALL also store which real
actor (if any) authenticated the request that created it, denormalized so
that link survives the actor's own later deletion. A result recorded before
this capability existed has no real actor behind it and is marked
accordingly, rather than erroring or fabricating an identity.

#### Scenario: Results accumulate
- **WHEN** an item receives verdict `failed`, is marked retest, and then
  receives verdict `pass`
- **THEN** the result log lists both results in order and the item's
  current status is `pass`

#### Scenario: Actor defaults to the authenticated caller
- **WHEN** a result is submitted without an `actor`
- **THEN** the result's actor is the display name of whoever authenticated
  the request (a user's email, or an agent token's name)

#### Scenario: Actor can be overridden while the run is open
- **WHEN** a result is submitted with an explicit `actor` display name,
  different from the authenticated caller
- **THEN** the result displays the submitted name, while still recording
  which real actor authenticated the request that created it

#### Scenario: Pre-existing results show as unknown, not broken
- **WHEN** a result recorded before this capability existed is read
- **THEN** its original actor display name is shown, with no real actor
  linked (`unknown`) rather than an error or a fabricated identity
