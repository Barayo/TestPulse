# Tasks: Link result actor to identity

TDD throughout: write the failing test first, then the minimal change to pass
(CLAUDE.md standing rule). Contract-first: `openapi.yaml` changes land in the
same commit as the Go handlers they describe, then `make generate`.

**Hard dependency**: `add-run-lifecycle-status` must be implemented and
archived first — this change's design (D3) relies on its closed-run gate
for immutability; there is no separate lock to build here.

## 1. Migration and domain

- [ ] 1.1 Amend `00002_core_domain.sql`: add `actor_kind text NOT NULL
      DEFAULT 'unknown' CHECK (actor_kind IN ('user', 'agent', 'unknown'))`
      and `actor_ref_id text` to `test_run_results`. Migration test
      asserting the columns, default, and constraint; existing rows read
      back as `unknown` with no explicit backfill needed (constant
      `DEFAULT`).
- [ ] 1.2 `domain.ResultActorKind` type (`user`/`agent`/`unknown`) and
      `Result`/`NewResult` fields for it plus the actor reference.

## 2. Store layer (test-first)

- [ ] 2.1 `RunRepo.AppendResult` takes the resolved actor kind/ref/display
      name and persists all three; `Results`/`Items` reads return them.
      Integration tests: a result with a real actor link, a result with an
      override display name but the real actor link still recorded, and a
      pre-existing-style row (inserted with defaults) reading back as
      `unknown`.

## 3. Service layer (test-first)

- [ ] 3.1 `RecordResult`: if `res.Actor == ""`, fill display name/kind/ref
      from `domain.ActorFromContext(ctx)`; if the client supplied an
      `actor` override, keep it as the display name but still resolve and
      store the real authenticated actor's kind/ref (design D2). Service
      tests for both paths, plus the case where no actor is in context yet
      (pre-route-protection call, if reachable) falling back to `unknown`
      rather than panicking.

## 4. Contract and handlers (test-first)

- [ ] 4.1 `packages/shared/openapi.yaml`: `NewResult.actor` becomes
      optional; `Result` gains `actorKind` and the real actor reference.
      `make generate`.
- [ ] 4.2 Handler tests: omitting `actor` records the authenticated caller;
      supplying `actor` records the override display name with the real
      actor link still present; `GET .../results` exposes the new fields.

## 5. Web UI

- [ ] 5.1 Run board's result-recording control: drop the required "who
      executed this" free-text input for the common case (implicit from
      the logged-in user); keep an optional override field, visible via a
      secondary control (e.g. "record on behalf of…") rather than a
      required field.
- [ ] 5.2 Result log entries show the actor's display name as before; no
      new prominent UI for `actorKind` (design Non-Goals) — a tooltip or
      similar low-emphasis treatment is enough if it's shown at all.

## 6. Docs and verification

- [ ] 6.1 Update `docs/api.md` (the results endpoint's request/response
      shape) and `docs/database.md` if it documents `test_run_results`.
- [ ] 6.2 Full verification sweep: `make coverage-api` (≥80%), `make
      coverage-web` (≥80% all metrics), `make lint`, `make generate` (no
      drift), `make e2e`.
