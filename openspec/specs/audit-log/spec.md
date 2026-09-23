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
system process), the action, the entity type and ID, the owning project
(when the entity type has one), the timestamp, and optional structured
detail about what changed. The audit log is append-only — no entry is ever
edited or deleted. The owning project SHALL be resolved automatically at
write time from the entity type and ID, using the same resolution logic
the system already uses to authorize a per-entity audit history request,
so no individual call site needs to supply it. Resolution failure (e.g.
for an entity type with no owning project) SHALL NOT block the audit
entry from being recorded — the entry is still written, with no project
association.

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

#### Scenario: A project-scoped write records its owning project automatically
- **WHEN** an entry is recorded for an entity type that belongs to a project (e.g. a case, suite, or run)
- **THEN** the entry's owning project is resolved and stored automatically, without the calling code supplying it

#### Scenario: A tenant-level write records no project association
- **WHEN** an entry is recorded for an entity type with no owning project (e.g. a user or an API token)
- **THEN** the entry is still recorded, with no project association, rather than failing or guessing one

### Requirement: Audit history is queryable per project, recency-ordered and limit-capped
The system SHALL let an actor with read permission on a project retrieve that project's most recent audit entries, newest first, capped to a caller-specified limit, for entries whose entity is scoped to that project. An anonymous visitor to a public project SHALL be able to retrieve the same feed via a public equivalent endpoint, matching the existing public/authenticated pairing used by every other project-scoped read endpoint. Entries for entity types with no owning project (e.g. a user, team, or API token) SHALL never appear in any project's feed.

#### Scenario: List a project's recent activity
- **WHEN** an actor with read permission on a project requests its recent activity
- **THEN** the project's audit entries are returned newest first, capped to the requested limit

#### Scenario: Entries only span this project's own entities
- **WHEN** a project's recent activity is requested
- **THEN** no audit entry belonging to a different project, or to a tenant-level entity with no owning project, appears in the result

#### Scenario: Public visitor reads the feed for a public project
- **WHEN** an anonymous visitor requests the recent activity for a project configured for anonymous access
- **THEN** the same feed is returned via the public endpoint, without requiring authentication

#### Scenario: A project with no recorded activity returns an empty feed
- **WHEN** a project has had no audited writes since this capability shipped
- **THEN** the feed returns an empty list, not an error

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
