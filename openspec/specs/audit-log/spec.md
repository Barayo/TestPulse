# audit-log

## Purpose

An append-only record of actor identity and action for every write, so
agent- and human-originated changes are both traceable, queryable per
entity.

## Requirements

### Requirement: Every write is recorded in an append-only audit log
The system SHALL record an audit entry for every mutating operation
(create/update/delete across projects, cases, suites, runs, folders, users,
and tokens), capturing the acting actor (human, agent, or an automated
system process), the action, the entity type and ID, the timestamp, and
optional structured detail about what changed. The audit log is
append-only — no entry is ever edited or deleted.

#### Scenario: A write creates an audit entry
- **WHEN** an authenticated actor creates, updates, or deletes any domain
  entity
- **THEN** an audit entry is recorded naming the actor, the action, and the
  entity, timestamped at the moment of the write

#### Scenario: Agent-originated writes are distinguishable from human ones
- **WHEN** a write is made by an actor authenticated via an API token
- **THEN** the audit entry's actor kind is recorded as an agent, distinct
  from a human user, even though the token acts at its creator's role

#### Scenario: Automated writes are distinguishable from both human and agent ones
- **WHEN** a write is made by an unattended background process rather than
  a resolved request-time actor (e.g. the automatic run-retention sweep or
  the automatic project-archiving sweep)
- **THEN** the audit entry's actor kind is recorded as `system`, distinct
  from both a human user and an agent-authenticated token

#### Scenario: Audit entry survives its actor's deletion
- **WHEN** the user who performed a past write is later deleted
- **THEN** that write's audit entry still displays the actor's name as it
  was at the time of the write, rather than an error or a blank actor

#### Scenario: Moving a case records its previous and new folder
- **WHEN** a case is moved from one section to another
- **THEN** the resulting audit entry's detail records both the previous and the new folder id

#### Scenario: Restoring a version records which version was restored
- **WHEN** a case's content is restored from an old version
- **THEN** the resulting audit entry's detail records which version was restored from and which new version it produced

### Requirement: Audit history is queryable per entity, scoped by permission on that entity's project
The system SHALL let an actor retrieve the audit history for a specific
entity, ordered oldest first, only if the actor holds read permission on
the project that entity belongs to. For an entity type with no owning
project (e.g. a user, team, or API token), only a Tenant Admin may
retrieve its audit history.

#### Scenario: List an entity's audit history
- **WHEN** an actor with read permission on a project requests the audit
  log for a project-scoped entity (e.g. a test case) belonging to that
  project
- **THEN** every recorded write to that entity is returned in chronological
  order

#### Scenario: Actor without project access is denied
- **WHEN** an actor with no permission on the project a requested entity
  belongs to requests that entity's audit log
- **THEN** the request is rejected, regardless of the actor otherwise being
  authenticated

#### Scenario: Tenant-level entity requires Tenant Admin
- **WHEN** a non-Tenant-Admin actor requests the audit log for an entity
  with no owning project (e.g. a user)
- **THEN** the request is rejected
