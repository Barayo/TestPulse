## 1. Domain & migration

- [x] 1.1 Write failing `domain_test.go` cases for `CaseContent.Validate()`: rejects an invalid `format` value; accepts `steps`/`text`/`gherkin`; defaults to `steps` when unset
- [x] 1.2 Add `Format` type + `CaseFormat...` constants and `Format`/`GherkinSource` fields to `CaseContent` (`apps/api/internal/domain/domain.go`); extend `Validate()` to check `Format` against the valid set — watch tests go green
- [x] 1.3 Add migration `00010_case_content_format.sql`: `format text NOT NULL DEFAULT 'steps' CHECK (format IN ('steps','text','gherkin'))` and `gherkin_source text NOT NULL DEFAULT ''` on `test_case_versions`

## 2. Store & service

- [x] 2.1 Write failing `store/cases_test.go` cases: creating/reading a case round-trips `format` and `gherkinSource`; a case created without `format` reads back as `steps`
- [x] 2.2 Update `apps/api/internal/store/cases.go` (`Create`, `NewVersion`, `scanContent`/equivalent) to read/write the two new columns — watch tests go green
- [x] 2.3 Write failing `server/cases_api_test.go` (or existing case-handler test file) HTTP-level scenarios: create case with each of the 3 formats round-trips correctly; invalid `format` value rejected with a validation error naming the field
- [x] 2.4 Confirm `createCase`/`editCase`/`getCase` handlers pass the new fields through unchanged (likely no code change needed since they decode/return the whole struct) — watch tests go green

## 3. API contract

- [x] 3.1 Add `format` (enum: steps/text/gherkin) and `gherkinSource` to the `CaseContent` schema in `packages/shared/openapi.yaml`
- [x] 3.2 Run `make generate`; confirm `packages/shared/src/api.ts` picks up the new fields with no drift

## 4. Design mock (Pepe, before any UI code)

- [x] 4.1 Dispatch Pepe (Fable 5) for the format picker in `CaseDrawer.tsx`'s create flow, the read-only rendering of `text`/`gherkin` content in `CaseStepsList.tsx`'s call sites, and the new `GherkinEditor` component — get user sign-off on the mock before writing any frontend code

## 5. Frontend — authoring

- [x] 5.1 Write failing `CaseDrawer.test.tsx` cases: format picker renders 3 options; selecting `text` hides the step editor and shows a description textarea; selecting `gherkin` hides the step editor and shows the Gherkin editor
- [x] 5.2 Add the format picker and conditional field rendering to `CaseDrawer.tsx` per the signed-off mock — watch tests go green
- [x] 5.3 Write failing `GherkinEditor.test.tsx`: renders a textarea with Given/When/Then placeholder guidance; controlled value/onChange round-trip
- [x] 5.4 Implement `GherkinEditor.tsx` (plain Textarea-based, no new dependency) — watch tests go green
- [x] 5.5 Write failing test for the confirm-before-switch warning when changing an existing case's format away from one with non-empty content
- [x] 5.6 Implement the confirm-before-switch prompt in the case edit flow — watch tests go green

## 6. Frontend — read views & diffing

- [x] 6.1 Write failing `CaseStepsList.test.tsx` (or equivalent) cases: renders a steps list for `format: steps`, a description block for `format: text`, and the Gherkin source block for `format: gherkin`
- [x] 6.2 Add format-aware branching to `CaseStepsList.tsx` and its callers (`CaseDetailPage.tsx`, `RunItemDetailPage.tsx`) — watch tests go green
- [x] 6.3 Write failing `versionDiff.test.ts` cases: diffing two same-format versions (text-vs-text, gherkin-vs-gherkin) produces a sensible diff; diffing two versions where `format` itself changed surfaces that as a change, not a garbled field diff
- [x] 6.4 Add format-aware branching to `versionDiff.ts` and `ContentDiffView.tsx` — watch tests go green

## 7. Sample Project showcase

- [x] 7.1 Add at least one `text`-format and one `gherkin`-format case to `apps/api/internal/sampledata/seed.go`, alongside the existing `steps`-format cases
- [x] 7.2 Update `internal/sampledata/seed_test.go` to assert the new format cases exist

## 8. Docs

- [x] 8.1 Update the case-authoring / content-model docs page(s) under `docs/` to describe the three formats and when to use each

## 9. Validation

- [x] 9.1 Rebuild and redeploy the local `docker-compose` stack; click through creating, editing, and viewing a case in each of the 3 formats in a real browser, including the format-switch warning and version-history diff view
- [x] 9.2 Run `make coverage-api` and `make coverage-web`; confirm both stay ≥ 80%
- [x] 9.3 Add e2e coverage (TD-148, "Creating a Gherkin case") under `apps/web/e2e/test-authoring.spec.ts` with a `testpulse_case_key` annotation. **Not yet synced to the live TD dogfood project** — no TestPulse API token was available this session; the case needs to be created on `testpulse.fly.dev`'s TD project (Test authoring section) and appended to `scripts/dogfood/case-map.json` as a follow-up.
