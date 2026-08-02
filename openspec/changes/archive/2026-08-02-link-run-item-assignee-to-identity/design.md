## Context

`RunItem.assignee` has been a free-text `text NOT NULL DEFAULT ''` column
since before the RBAC/teams work landed. #100 built a full assignment UI
(per-item, bulk, default-at-creation, filter including Unassigned) directly
on top of that field, deliberately deferring the identity upgrade.

`testpulse.fly.dev` is a real, continuously-deployed instance (Fly's
GitHub-linked auto-deploy applies every push automatically), but nothing
has published a version yet. Confirmed live state at the time of writing:
v52, with #100's free-text assignment feature having already been
reachable in production for several hours.

## Goals / Non-Goals

**Goals:**
- New assignments can only reference a real project member (user or team).
- Real referential integrity — the database itself enforces that an
  assignee id refers to an actual user or team, and handles that user or
  team being deleted later, rather than the application maintaining it.
- Keep the change small: one clean breaking migration, no compatibility
  scaffolding for data that doesn't need preserving pre-launch.

**Non-Goals:**
- No preservation of existing free-text assignee values — see Decisions.
- No change to filtering/grouping *behavior* — the assignee filter still
  offers one chip per distinct assignee plus Unassigned/All; only what it
  reads (`assignee.name` instead of a bare `assignee` string) changes.
- No permission-flag changes (#104's own scope, explicitly deferred there).

## Decisions

**A clean breaking reset, not the additive actor-link pattern.** This
repo already has a precedent for linking free text to a real identity
without breaking anything — `test_run_results.actor`/`actor_kind`/
`actor_ref_id`, which preserves history because results are an
append-only audit log where old data matters even after the actor is
gone. Assignment is different: it's *current, mutable state* — "who is
this item assigned to right now" — not a historical record, and nothing
has shipped a published version yet. Given that, and explicit direction to
prefer the simpler cut, this change skips the dual-column/`unknown`-state
approach entirely: `assignee` is dropped, `assignee_user_id`/
`assignee_team_id` take its place, and anything currently assigned resets
to unassigned. This is a deliberate, one-time exception to "don't lose
data" — justified specifically by pre-launch status, not a pattern to
repeat once the app has real users depending on continuity.

**Real foreign keys, not a denormalized kind+ref_id pair.** Because there's
no need to survive the referenced user/team's deletion (unlike the actor
log), `assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL` and
`assignee_team_id uuid REFERENCES teams(id) ON DELETE SET NULL` (mutually
exclusive via a check constraint) let Postgres enforce referential
integrity directly — an assignee id can never point at a nonexistent user
or team, and deleting that user/team automatically reverts the item to
unassigned with zero application code. This is simpler than the actor
pattern's `text` ref_id + app-level validation, and appropriate specifically
*because* this field doesn't need historical durability.

**Response shape: a nullable `assignee: { kind, id, name } | null`
object, not parallel flat fields.** The display name is resolved via a
join at query time (not stored), so it's always accurate as of read time —
appropriate for current-state data, unlike the actor log's denormalized
`actor` text (which must stay frozen at time-of-recording). A single
nullable object reads more naturally on the frontend (`item.assignee?.name`)
than three parallel optional fields.

**Request shape mirrors the existing `ProjectMember`/`ProjectTeamRole`
split.** `assigneeUserId`/`assigneeTeamId` on `ItemStatusUpdate`, matching
how project membership already separates user vs. team roles at the API
boundary, rather than inventing a `kind` enum parameter.

**The picker is scoped to the project's membership, not every user in the
instance.** `GET /projects/{projectKey}/members` already exists and is
already used by `ProjectMembersPage`. Reusing it keeps the assign picker's
list short and relevant.

**`AssignDialog` becomes a search dialog like `UserPicker`, extended to
list teams too.** Two labeled sections (People / Teams) instead of a
single flat list — assigning to a team has different real-world meaning
(shared ownership) than assigning to one person, so they stay visually
distinct.

**Sample Project seed data gets real users.** #100's seed data assigned
items to "Julia López" and "Miguel Alonso" — decorative strings borrowed
from the existing `Actors` pool used for result-actor overrides, not real
`User` rows. With free text gone entirely, the Sample Project needs at
least one more real user beyond the bootstrap admin to demonstrate the
picker at all. This change seeds one or two additional users via the
existing `CreateUser` + `SetProjectMember` calls and assigns the existing
seeded items to them for real.

## Risks / Trade-offs

- **Every live assignment resets to unassigned on deploy** → accepted
  explicitly: pre-launch, no published version, confirmed acceptable.
- **Breaking the assign endpoint's request *and* response shape** →
  mitigated by this being one clean migration rather than a staged
  rollout; any external API consumer needs to move to the new shape in
  one step, which is preferable pre-launch to carrying two shapes.
  Deferred: a corresponding update to `README.md`/`ROADMAP.md` API surface
  notes if any exist, and the MCP tool surface if it references assignee.
- **Team assignment's real-world meaning** beyond storage (e.g. how #104's
  eventual restriction treats "assigned to a team") stays out of scope
  here, same as before.
