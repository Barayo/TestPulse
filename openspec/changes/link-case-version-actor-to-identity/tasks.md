## 1. Database

- [x] 1.1 Write a new migration `apps/api/internal/db/migrations/NNNNN_link_case_version_actor.sql`: `test_case_versions` gains `actor_kind text not null default 'unknown' check (actor_kind in ('user','agent','unknown'))` and `actor_ref_id text` (nullable, no FK)
- [x] 1.2 Confirm goose applies it cleanly on top of the current schema

## 2. Backend: default display name on account creation (TDD)

- [x] 2.1 Write failing tests for a pure `defaultDisplayName(email string) string` helper: `jane.doe@x.com` → "Jane Doe", `rgriffiths@x.com` → "Rgriffiths", `j_smith99@x.com` → "J Smith99", separators `.`/`_`/`-`/`+`
- [x] 2.2 Implement the helper (`internal/domain` or `internal/service`, wherever `CreateUser` already lives) — landed as `domain.DefaultDisplayName`
- [x] 2.3 Write failing service tests: `CreateUser` sets `displayName` from the helper when not already set; `BootstrapAdmin`'s hardcoded "Admin" name is unaffected
- [x] 2.4 Wire the helper into `CreateUser`
- [x] 2.5 Confirm green

## 3. Backend: actor on case versions (TDD)

- [x] 3.1 Write failing store tests: `Cases.Create`/`Cases.Edit` accept an actor and the resulting `domain.CaseVersion` carries its `actorKind`/`actorRefId`; a version created via a path with no actor context reads back `actorKind: "unknown"`
- [x] 3.2 Extend `domain.CaseVersion` with `ActorKind`/`ActorRefID` (mirroring `domain.Result`'s fields)
- [x] 3.3 Update `Cases.Create`/`Cases.Edit` (store) to insert `actor_kind`/`actor_ref_id`, and their SELECTs to scan them
- [x] 3.4 Update the service layer (`CreateCase`/`EditCase` or equivalent) to resolve the actor from `domain.ActorFromContext` and pass it through, the same way `RecordResult` already does
- [x] 3.5 Confirm green

## 4. API contract

- [x] 4.1 Update `packages/shared/openapi.yaml`: `CaseVersion` schema gains `actorKind`/`actorRefId`
- [x] 4.2 `make generate`; confirm no drift

## 5. Frontend: Version History row (TDD)

- [x] 5.1 Write failing tests extending `CaseDetailPage.test.tsx`: a version with a known actor renders `Avatar` (size-4) + first name folded into the signal line, with the full name as a `title` tooltip; a version with `actorKind: "unknown"` renders the signal line with no avatar; the actor is not repeated in the expanded diff panel
- [x] 5.2 Implement the row change in `CaseDetailPage.tsx` per `version-history-actor-design.html` (Pepe mock) — fold into the signal line, first-name-only, no third line
- [x] 5.3 Confirm green

## 6. Documentation and Sample Project

- [x] 6.1 Update `docs/api.md` (CaseVersion fields) and `docs/database.md` (`test_case_versions` actor columns)
- [x] 6.2 Sample Project: `Seed()` already runs under `domain.WithActor(ctx, adminActor)`, so every seeded case version picks up a real `user`/Tenant-Admin actor automatically (not `unknown` as originally assumed) — no seed.go change needed; confirmed via `TestSeedContentShowcasesLibraryRichness` and friends passing unchanged, and by reading the actor-resolution path (`resolveActor` in `service.go`)
- [x] 6.3 `openspec validate link-case-version-actor-to-identity --strict` and `openspec validate --specs` both pass

## 7. End-to-end

- [x] 7.1 Extend an existing e2e scenario (or add one) in `apps/web/e2e/ui-navigation.spec.ts` covering: editing a case as the logged-in user shows that user's avatar/first name on the new version's row
