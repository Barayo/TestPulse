## ADDED Requirements

### Requirement: Every write is recorded in an append-only audit log
The system SHALL record an audit entry for every mutating operation
(create/update/delete across projects, cases, suites, runs, folders, users,
and tokens), capturing the acting actor (human or agent), the action, the
entity type and ID, and the timestamp. The audit log is append-only — no
entry is ever edited or deleted — and is written in the same transaction as
the write it records, so it cannot be silently lost.

#### Scenario: A write creates an audit entry
- **WHEN** an authenticated actor creates, updates, or deletes any domain
  entity
- **THEN** an audit entry is recorded naming the actor, the action, and the
  entity, timestamped at the moment of the write

#### Scenario: Agent-originated writes are distinguishable from human ones
- **WHEN** a write is made by an actor authenticated via an API token
- **THEN** the audit entry's actor kind is recorded as an agent, distinct
  from a human user, even though the token acts at its creator's role

#### Scenario: Audit entry survives its actor's deletion
- **WHEN** the user who performed a past write is later deleted
- **THEN** that write's audit entry still displays the actor's name as it
  was at the time of the write, rather than an error or a blank actor

### Requirement: Audit history is queryable per entity
The system SHALL let an authenticated actor retrieve the audit history for
a specific entity, ordered oldest first.

#### Scenario: List an entity's audit history
- **WHEN** an authenticated actor requests the audit log for a specific
  entity (e.g. a test case)
- **THEN** every recorded write to that entity is returned in chronological
  order
