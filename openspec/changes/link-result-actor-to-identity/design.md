## Context

`test_run_results.actor` is a plain `text NOT NULL CHECK (actor <> '')`
column (`00002_core_domain.sql`), populated by whatever string a client
sends. `add-identity-basics` gives every request a resolved `domain.Actor`
via `domain.ActorFromContext(ctx)`, already used by the audit log
(`Service.audit` in `apps/api/internal/service/identity.go`). This change
reuses that same mechanism for results, gated by `add-run-lifecycle-status`
so a result's actor can't be silently rewritten after the fact.

## Goals / Non-Goals

**Goals:**
- A newly recorded result's actor is, by default, the real authenticated
  caller — not an arbitrary string.
- The override path (explicit `actor` in the request) stays available for
  the agent-recording-on-behalf-of-a-human case, without weakening the
  identity guarantee for the common case.
- Historical results (recorded before this change) remain fully readable,
  clearly marked as not identity-linked, rather than migrated into a
  fabricated identity or breaking.

**Non-Goals:**
- No retroactive identity resolution for historical results — there is no
  reliable way to map an old free-text `actor` string back to a real user,
  and guessing would be worse than an honest `unknown`.
- No change to the append-only nature of the result log itself — this
  change decides what goes into a *new* row, not how existing rows are
  edited (they still can't be).
- No UI change to how results are *displayed* beyond showing the actor's
  name as before — `actorKind` is metadata for correctness/filtering, not
  a new prominent UI element.

## Decisions

### D1: Two columns added to `test_run_results`, denormalized like `audit_log`
`actor_kind text CHECK (actor_kind IN ('user', 'agent', 'unknown')) NOT
NULL DEFAULT 'unknown'` and `actor_ref_id text` (nullable — the user or
token ID, when known; `NULL` for `unknown` and for a client-supplied
override that doesn't match the authenticated caller). The existing
`actor` column stays as the display name, exactly like `audit_log.actor_name`
— denormalized so a result's displayed actor survives that user being
deleted later, consistent with the pattern `add-identity-basics` already
established.

**Alternative considered**: a foreign key to `users`/`api_tokens`. Rejected
for the same reason `audit_log` rejected it: a deleted user must not break
or null out historical results, and a plain reference column with no FK
constraint (matching `audit_log.actor_id`'s existing precedent) achieves
that without needing `ON DELETE SET NULL` gymnastics.

### D2: Default-derive, but keep the override — resolved in the service layer
`RecordResult(ctx, itemID, res domain.NewResult)`: if `res.Actor == ""`,
fill it from `domain.ActorFromContext(ctx)` (display name + kind + ref).
If the client supplied `res.Actor` explicitly, keep the free-text value as
given but still record the *authenticated* actor's kind/ref alongside it —
the override changes what's *displayed*, not who is *cryptographically
known* to have made the request. This means `actor_kind`/`actor_ref_id`
always reflect the real authenticated caller when one exists (including on
an override), and `unknown` is reserved for genuinely actor-less rows:
pre-existing historical data, and (in principle) any future write path that
still doesn't carry a resolved `Actor`.

**Alternative considered**: let an override fully replace the real actor
link too (i.e. `actor_ref_id` points at whatever the override claims).
Rejected — that would let any caller attribute a result to an arbitrary
other user, defeating the entire point of linking actor to identity; the
override is for *display* flexibility, not identity spoofing.

### D3: No enforcement of "editable only while open" here — inherited for free
`add-run-lifecycle-status` already rejects `POST .../results` outright once
a run is closed. Since a result's actor is only ever set at creation
(results are still append-only — see Non-Goals), "the actor stays editable
while open" is automatically true and "sealed once closed" needs no
additional code in this change. Re-implementing that check here would be
duplicated, driftable logic.

### D4: `unknown` is a valid, first-class `ActorKind` value here — not reused from `add-identity-basics`'s `ActorKind`
`add-identity-basics`'s `domain.ActorKind` (`user`/`agent`) has no `unknown`
value, and shouldn't gain one globally — every *authenticated* actor is
always a real user or agent by construction (`Authenticate` middleware
rejects anything else with `401`). `unknown` is specific to this change's
problem (a *result row* that predates real identity, not a request-time
concept), so it lives as its own small enum scoped to results, not as a
change to the shared `Actor`/`ActorKind` types.

## Risks / Trade-offs

- **[Risk] Migration backfill on a large `test_run_results` table** →
  Mitigation: the backfill is a single `UPDATE ... SET actor_kind =
  'unknown'` with no per-row computation (the new columns default to
  `unknown`/`NULL` already, so existing rows need no explicit backfill
  statement at all beyond the `ALTER TABLE ... ADD COLUMN ... DEFAULT`
  itself, which Postgres applies without a full table rewrite for a
  constant default).
- **[Trade-off] Override + real-actor-link means a result can display one
  name while `actor_ref_id` points at someone else** → Accepted per D2; the
  audit log already records who actually made the API call, so the "real"
  attribution is never lost even when the display name is overridden.

## Migration Plan

1. Land after `add-run-lifecycle-status` (hard dependency — this change's
   design assumes the closed-run gate already exists).
2. Amend `00002_core_domain.sql`: add `actor_kind`/`actor_ref_id` to
   `test_run_results` with the defaults above.
3. Service layer: derive-or-override logic in `RecordResult`; contract
   update (`actor` optional); handler test coverage for both paths.
4. Web: drop the required-actor input for the common path, keep an
   optional override field.

## Open Questions

- None. `GET /api/v1/items/{itemId}/results` exposes `actorKind`/the real
  actor reference to any authenticated caller — it's execution history, not
  a credential, and every other piece of run data is already visible to any
  authenticated user with no extra scoping.
