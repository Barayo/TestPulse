## Context

`add-testrail-importer` (archived) built the first vendor content importer and deliberately made almost everything about it source-opaque: the `import_jobs` table, `apps/api`'s create/poll/claim/patch routes, the poll-not-push control direction, encrypted-credentials handling, the scoped-agent-token claim model, and the browser's data-driven entry-point menu all treat `source` as an arbitrary string. Four more vendor cards (#190-193) sit behind it on the backlog for exactly this reason. This change is the first one to actually exercise that reuse: Qase (#190), adding `source: "qase"` alongside `testrail`.

Qase's REST API v1 (verified against `qase-tms/specs`, the published OpenAPI source, not assumed) differs from TestRail's in three ways that matter for the mapping/client layer, all captured below. Everything not called out as a new decision here is inherited from `add-testrail-importer`'s design.md verbatim.

## Goals / Non-Goals

**Goals:**
- Import a Qase project's suite tree and cases (with steps and mappable custom fields) into a TestPulse project, through the exact same Connect → Preview → Result flow and dry-run guarantee `add-testrail-importer` shipped.
- Add `qase` as a second, fully-plugged-in `source` without touching `apps/api`'s schema, routes, or handlers — proving out the reusability the TestRail change was designed for.

**Non-Goals:**
- Run/result history import — inherits the same deferral as TestRail, for the same reason (`CaseVersion` rows have no bulk-backfill path; this is a materially separate problem from migrating the case library).
- Reconstructing Qase's own case edit history as TestPulse case versions — a Qase case imports at version 1 (its current state), matching TestRail's behavior.
- `TestStep.steps` nested/child steps — Qase supports a step tree (a step can contain child steps), but v1 maps only the top-level `action`/`expected_result`/`data` sequence, matching `domain.Step`'s own flat shape (no nested-step concept exists in TestPulse at all, not just unmapped here).
- `TestCase.Parameter` (Qase's data-driven case support) — out of scope; each Qase case imports as one TestPulse case regardless of how many parameter sets it defines. A parameterized-case-aware import is a real follow-up but a separate mapping problem (TestPulse's own `add-parameterized-cases` capability would need to be the target, not plain `Case`).

## Decisions

**Inherited unchanged from `add-testrail-importer` (D1, D2, D3, D4, D5, D9 in that design):**
- Control direction: the importer polls `apps/api`; `apps/api` never calls the importer.
- `apps/api` owns the generic `import_jobs` table; `source: "qase"` is just another opaque value in the existing `source text` column — no migration.
- The same `POST/GET .../import-jobs[/{jobId}]` (browser-facing) and `GET/PATCH /import-jobs` (agent-facing) routes, unchanged, no new `packages/shared/openapi.yaml` surface.
- Per-project-scoped agent token model (one importer deployment per target project).
- Attribution: the job's `created_by` records the authorizing human; imported content is attributed to the importer's own agent identity.
- Progress UI: count-up against `progress_current`/`progress_total`, tight poll interval.

**D-Q1: Qase client auth and project addressing — single `Token` header; project identified by string `code`, not a numeric id.**
Verified against `qase-tms/specs/testops-api/v1/src.yaml`: `securitySchemes.TokenAuth` is `apiKey`/`header`/`Token` — one static header, no Basic-auth username/password pair like TestRail's email+API-key. Every project-scoped endpoint takes a `code` path/query parameter (`parameters/Code.yaml`), a short string the user already knows from their own Qase project URL (e.g. `PRJ`), not an internal integer id requiring a lookup call. Consequence: the credentials map gains `apiToken` and `projectCode` (parallel to TestRail's `apiKey`/`email`/`testRailProjectId`), and — unlike TestRail — there's no separate "resolve the project" step needed before crawling starts, since `code` is exactly what the user types into the Connect screen.

**D-Q2: Base URL — defaults to Qase's public SaaS endpoint, overridable for Enterprise VPC customers.**
Qase has no self-hosted product (confirmed: Qase's own enterprise page describes dedicated-VPC isolation within their managed cloud, not a customer-run deployment) — so, unlike TestRail's always-required site URL, `baseUrl` defaults to `https://api.qase.io/v1` and is only surfaced on the Connect screen as an optional "Advanced" field, for the minority of Enterprise customers on a dedicated-VPC hostname. This keeps the common case (one field: paste your API token) simpler than TestRail's Connect screen while still not hard-blocking the VPC case.

**D-Q3: Domain mapping — Qase's own suite tree maps directly to a TestPulse Folder tree; no "suite vs. section" split.**
TestRail's D6 needed a two-level split (Suite → top-level Folder, Section → nested Folder) because a TestRail Suite is an independent case-authoring repository with its own Section tree, and TestRail Section names collide across suites. Qase has no equivalent split: `GET /suites` returns one flat list per project where each Suite already carries its own `parent_id` (nullable), forming a single tree per project (verified via `schemas/Suite.yaml`). The mapping is therefore simpler and more direct than TestRail's:
- A Qase suite with `parent_id: null` → a top-level TestPulse Folder.
- A Qase suite with a non-null `parent_id` → a nested Folder beneath its parent suite's own mapped Folder, recursively, preserving Qase's tree exactly.
- A Qase case (`suite_id` on `TestCase`) → a TestPulse Case in its suite's mapped Folder.
There is no intermediate grouping step (no analogue to TestRail's "top-level folder per suite, nested folder per section") — Qase's tree *is* the folder tree, one level for one level.

**D-Q4: Custom field mapping — the same downgrade-or-drop-and-report contract as TestRail (D7), against Qase's own type list.**
`GET /custom_fields?entity=case` (global definitions, not per-project) returns each field's `type`, one of `string, text, number, checkbox, selectbox, radio, multiselect, url, user, datetime` (`paths/custom_fields.yaml`). Applying the same "map cleanly or drop and name it" rule TestRail's D7 established:
- `string`, `text` → TestPulse `text` (created/reused per import, same as TestRail).
- `selectbox`, `radio` → TestPulse `select` (both are Qase's single-choice types; the field's configured choice list becomes the `select` field's options, populated on first encounter exactly like TestRail's single-select mapping).
- `number`, `checkbox`, `multiselect`, `url`, `user`, `datetime` → dropped, and named individually (by the field's own `title`, not its numeric `id`) in the job's report — never silently, never collapsed, matching TestRail's report guarantee verbatim.
A case's own `custom_fields` array (`TestCase.yaml`) is `[{id, value}]`, keyed by the global field's numeric `id` with `value` always a plain string (simpler than TestRail's raw-JSON-typed values) — no stringification helper is needed on the Qase side; `parseCase`'s TestRail-specific `stringifyCustomFieldValue` has no equivalent requirement here.

**D-Q5: `tools/import-connector` package layout — `internal/qaseclient` alongside `internal/testrailclient`, sharing `internal/testpulseclient` and the poller/config skeleton unchanged.**
Mirrors `add-testrail-importer`'s own file layout exactly: a new hand-rolled REST client (`internal/qaseclient`, no SDK dependency — Qase's API is simple enough that generating or vendoring a client isn't justified, matching the precedent `testrailclient` already set), and `internal/importer` gains a `qase` branch (selected by the claimed job's `source`, exactly like the existing `testrail` branch) implementing D-Q3/D-Q4. `internal/config`, `internal/poller`, `internal/testpulseclient`, and `cmd/import-connector/main.go` are unchanged — `--source` was already a runtime flag selecting which claim-filter and importer branch to run, not a compile-time choice.

**D-Q6: Trademark — same conservative pattern as TestRail (D10), applied by default in the absence of a published Qase policy.**
No published Qase trademark/brand-usage policy was found (unlike Idera's explicit guidelines for TestRail). Rather than assume a more permissive stance, this change applies the identical conservative pattern D10 established: the tool stays generically named (`tools/import-connector`, `--source=qase`), UI copy uses "Import from Qase" as a plain referential phrase (not incorporated into a product/tool name), no Qase logo anywhere, and `docs/integrations.md` plus the Connect screen get the same disclaimer-footnote treatment (independent project, not affiliated with, sponsored by, or endorsed by Qase Ltd; "Qase" is Qase's trademark). Tracked under the same standing concern issue (#195) as TestRail and the remaining vendor cards (#191-193).

**D-Q7: In-app entry point — one more array entry, no new UI primitive.**
`add-testrail-importer`'s D8 already made the entry-point menu and `/projects/import/:source` route data-driven specifically so this would be true: "Import from Qase" is a second entry in the same source list (menu → route, unchanged), and the Connect screen's credential fields are rendered per-source (API token + project code + optional advanced base-url override for Qase, vs. TestRail's site URL + email + API key + project id) rather than a new screen.

## Risks / Trade-offs

- **[Risk] Qase's `custom_fields` list is global (not per-project), same as TestRail's `get_case_fields`.** A field defined for `entity: run` or `entity: defect` but not `case` must be excluded before mapping — filtered via the `entity=case` query param at fetch time, not a post-hoc check. Low risk, same shape as TestRail's own site-wide field list, already handled by that precedent.
- **[Trade-off] `TestStep.steps` (nested child steps) and `TestCase.Parameter` (data-driven cases) are both real Qase features with no v1 mapping (Non-Goals).** → Accepted: TestPulse's `domain.Step` has no nested-step concept at all (not a Qase-specific gap), and parameterized-case-aware import is a materially separate mapping problem best done as its own follow-up once there's a concrete need, not speculatively bundled here.
- **[Risk] No published Qase trademark policy to verify against (unlike Idera's for TestRail).** → Mitigation: default to the more conservative pattern rather than assume permissiveness; revisit if Qase publishes explicit guidelines or if legal review surfaces one.

## Migration Plan

Additive only, and narrower than `add-testrail-importer`'s: no new migration, no new `apps/api` routes, no `packages/shared/openapi.yaml` changes. Everything new lives in `tools/import-connector` and the frontend's existing data-driven source list.

Suggested build sequencing:
1. `tools/import-connector/internal/qaseclient` — REST client (suites, cases, custom fields), TDD per the existing `testrailclient` test pattern.
2. `tools/import-connector/internal/importer` — add the `qase` mapping branch (D-Q3/D-Q4), reusing the existing dry-run/fake-writer test harness.
3. `apps/web`: `ProjectsPage.tsx` source-list entry, `ImportProjectPage.tsx` Qase Connect-screen fields.
4. `e2e/import-connector.spec.ts` (or a new `qase-importer.spec.ts` sibling) — scenarios for the parts reachable without a live Qase account (menu entry, route navigation, Connect form validation), matching TestRail's own E2E scope limitation.
5. `docs/integrations.md` — extend with the Qase section and disclaimer; `deploy/compose/docker-compose.yml` and the Helm chart's `import-connector` templates gain a Qase-flavored example alongside the existing TestRail one.

## Open Questions

- **Qase project `code` validation**: whether the Connect screen should call `GET /projects/{code}` to validate the code exists before allowing a dry-run submission, or let a bad code surface as a job failure with a clear error message (matching how TestRail's numeric project id is handled today — no pre-validation, error surfaces via the job's `error` field). Leaning toward the latter for consistency, but not locked.
- **Custom field option value stability across re-imports**: `selectbox`/`radio` options are matched by value string, not Qase's own option id, in this design — sufficient for a one-shot migration (v1's actual use case) but not yet examined for a hypothetical "re-run the same import to sync" scenario, which is out of scope for both this change and the TestRail one.
