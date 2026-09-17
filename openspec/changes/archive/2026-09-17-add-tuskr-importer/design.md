## Context

`add-testrail-importer` (archived) established the source-opaque `import_jobs` machinery; `add-qase-importer`, `add-zephyr-scale-importer`, `add-kiwi-tcms-importer`, and `add-xray-importer` each proved it reusable against increasingly different vendor shapes. This change (Tuskr, #193, the last remaining sibling split from #182) is the last card in the structural-importer family. Its own GitHub issue explicitly flagged Tuskr's API maturity as unverified before scoping — two research passes against Tuskr's own official documentation (`tuskr.app/kb/latest`) resolved that: Tuskr has a real, documented REST API with genuine list/read endpoints, not just write.

Confirmed facts this design relies on: base endpoint `https://api.tuskr.live/api/tenant/<tenant-id>/`, Bearer Personal Access Token auth (per-user, generated from profile settings); `GET .../test-suite` returns each suite with a nested `sections` array in the same response — a strict, confirmed two-level Test Suite → Section hierarchy (sections are not themselves nestable, per Tuskr's own concept docs); a case's steps are modeled as one specific custom-field *type* ("Steps", two variants — instructions-only or instructions-with-expected-result) among Tuskr's full custom-field type set (Checkbox, Date, Dropdown, Integer, Multi-select, Steps, Text, URL, User), not a first-class always-present case property; **no custom-field-definitions endpoint exists at all** — Tuskr's complete documented API surface is `project`, `test-case`, `test-run`, `test-run-result/bulk`, `test-suite`, with custom field type/name management confined to the product's own Administration UI; pagination is 100 rows/page (`page` param, `meta.total`/`meta.pages`); a documented, enforced account-wide rate limit of 10 requests/second (shared across all users of the account) is surfaced via `X-RateLimit-*` response headers.

## Goals / Non-Goals

**Goals:**
- Import a Tuskr project's Test Suite → Section tree and the cases within each section into a TestPulse project, through the same Connect → Preview → Result flow and dry-run guarantee every prior importer shipped.
- Add `tuskr` as a sixth, fully-plugged-in `source` without touching `apps/api`'s schema, routes, or handlers.
- Respect Tuskr's documented rate limit with real client-side pacing — the first importer in this family where hitting the vendor's rate limit during a real crawl is a realistic, not theoretical, risk.
- Close out the structural-importer family: after this change, no further vendor-importer cards remain planned.

**Non-Goals:**
- Test Run/Result history import — inherits the same deferral as every prior importer (no bulk `CaseVersion`/run-result backfill path).
- Reconstructing a Tuskr case's own edit history as TestPulse case versions — an imported case starts at version 1.
- Full custom-field type fidelity — since no field-definitions endpoint exists, this importer cannot reliably classify a custom field's configured type from the API alone; see D-T5.
- A general-purpose Tuskr SDK — this change builds exactly the endpoints it needs, not a reusable client covering test runs, bulk-export, or write operations (this importer never writes back to Tuskr).

## Decisions

**Inherited unchanged from the prior five importers:**
- Control direction: the importer polls `apps/api`; `apps/api` never calls the importer.
- `apps/api` owns the generic `import_jobs` table; `source: "tuskr"` is just another opaque value in the existing `source text` column — no migration.
- The same `POST/GET .../import-jobs[/{jobId}]` (browser-facing) and `GET/PATCH /import-jobs` (agent-facing) routes, unchanged, no new `packages/shared/openapi.yaml` surface.
- Per-project-scoped agent token model (one importer deployment per target project).
- Attribution: the job's `created_by` records the authorizing human; imported content is attributed to the importer's own agent identity.
- Progress UI: count-up against `progress_current`/`progress_total`, tight poll interval.

**D-T1: Auth — a tenant ID plus a Personal Access Token, both required; no separate site URL field.**
Confirmed: Tuskr is a single SaaS deployment (no self-hosted mode, unlike TestRail/Kiwi TCMS/Xray Server-DC), so the API host is fixed (`https://api.tuskr.live`). A request's URL path itself carries the tenant id (`/api/tenant/<tenant-id>/...`), and auth is a Bearer PAT — both values come from the user's own Tuskr account settings. `tuskrclient.New(tenantID, token string) *Client` mirrors Zephyr Scale's D-Z1 shape (fixed host, no site URL) but adds the tenant id as a required path-building input, since Tuskr's tenant id is not embedded in the token itself. Connect-screen credential fields: `tenantId`, `personalAccessToken`, `projectId`.

**D-T2: Domain mapping — a Test Suite maps to a top-level Folder, its Sections map to nested Folders, one level deep only.**
Confirmed via `GET .../test-suite`'s own documented response shape (`{id, name, sections: [{id, name}]}`) and Tuskr's concept docs stating the hierarchy is strictly `Test Suite → Section → Test Case` with no further nesting. This is simpler than every prior importer's folder-tree walk (no recursion needed — `BuildTuskrPlan` maps the whole tree from one paginated `ListTestSuites` call's response, not a per-folder recursive fetch), and needs no "root plan/section" edge-case handling TestRail's D6 or Kiwi TCMS's D-K3 needed.

**D-T3: A case's steps are detected by runtime value shape within its custom fields, not by a trusted field name or id.**
Confirmed there is no field-definitions endpoint to look up which custom field is configured as the "Steps" type ahead of time, and the exact `customFields` response key for a Steps-type field couldn't be independently verified as stable across projects (Tuskr's own API examples show `stepsWithExpectedResults`/`steps` as illustrative variable names, not confirmed as reserved response keys). Rather than assume a fixed key name that could silently miss a real customer's differently-configured field, `toTuskrCasePlan` scans a case's `customFields` map for the first value shaped like `[]{step, ...}` (a JSON array of objects each carrying at least a `step` field) — a structural detection, not a name lookup. If found, its entries map to `domain.Step` (action from `step`/`instructions`, expected result from `expectedResult` when present, empty otherwise) and that field is excluded from the generic custom-field loop (D-T5), so it's never also emitted as a `text` field. If no such shape is found, the case has no steps (`Steps` is empty), matching every prior importer's "no data to force-fit" handling rather than guessing.

**D-T4: Rate limiting — a real client-side pacer, not just documented awareness.**
Unlike Xray Cloud's rate limit (documented but never realistically hit by this family's typical crawl sizes), Tuskr's 10 req/s **account-wide** cap is tight enough that a real multi-hundred-case project's crawl (suites, then every case, potentially page after page) could plausibly hit it. `tuskrclient.Client` wraps every outgoing request through a simple fixed-interval pacer (minimum 110ms between requests from one client instance — a small margin under the documented 10/s), rather than reacting to 429s after the fact. This is process-local, not truly account-wide (a second concurrent importer process against the same Tuskr account isn't coordinated with this one) — a stated, accepted v1 limitation, since this family's per-project-scoped-token deployment model (D4, inherited) means concurrent imports against the same Tuskr account are already an edge case, not the common path.
*(Rejected)* Reactive backoff-on-429 only, no proactive pacing — considered, but given the limit is both documented and low (10/s), proactively pacing under it is simpler and avoids ever needing retry logic at all for the common case; a 429 can still happen (a second concurrent process, or an account nearing its plan's hourly cap) and is surfaced as a plain wrapped error rather than silently retried, consistent with every prior importer's error-handling stance.

**D-T5: Generic custom-field mapping — value-shape-based, the same honest fallback as Zephyr Scale/Xray, with the Steps-shaped field excluded (D-T3).**
No field-definitions endpoint means this importer cannot know a field's configured type (Dropdown vs. Text vs. Integer, etc.) from Tuskr's API — the same unverifiable-type-system situation Zephyr Scale's D-Z5 and Xray's D-X6 already resolved the same way: map by the field's runtime value shape. A string-valued custom field (other than the one already claimed by D-T3's steps detection) maps to a TestPulse `text` custom field; anything else (number, boolean, array, object) is dropped and named individually in the report. This intentionally does not attempt to distinguish Dropdown from Multi-select from Text — without a definitions endpoint, any such distinction would be a guess, and this project's established norm is to narrow scope rather than guess.

**D-T6: `tools/import-connector` package layout — `internal/tuskrclient` alongside the five existing clients, sharing `internal/testpulseclient` and the poller/config skeleton unchanged.**
Mirrors the established layout: a new client package (`internal/tuskrclient`, REST+JSON with the D-T4 pacer built in), and `internal/importer` gains a `tuskr` branch (`BuildTuskrPlan`, `RunTuskr`) implementing D-T2/D-T3/D-T5. `internal/config`, `internal/poller`, `internal/testpulseclient`, and `cmd/import-connector/main.go` are unchanged in shape (poller gets one more `New*Client`/branch, exactly like every prior addition).

**D-T7: Trademark — same conservative pattern as the other five; Tuskr's own policy not yet independently verified.**
No published Tuskr trademark/brand-usage policy was found during either research pass (same situation as Qase/Zephyr Scale/Kiwi TCMS/Xray). Applies the identical conservative pattern: generic tool name (`tools/import-connector`, `--source=tuskr`), "Import from Tuskr" as plain referential UI copy, no Tuskr logo, `docs/integrations.md` and the Connect screen carry the same disclaimer-footnote treatment. Tracked under the same standing concern issue (#195) as the other five.

**D-T8: In-app entry point — one more array entry, single auth shape, no new UI primitive.**
"Import from Tuskr" is a sixth entry in the same data-driven source list (menu → `/projects/import/tuskr`, the existing `/projects/import/:source` route, unchanged). Unlike Xray, Tuskr needs no mode toggle — one credential set (tenant ID, Personal Access Token, project ID).

## Risks / Trade-offs

- **[Risk] D-T3's shape-based steps detection could misidentify a differently-shaped custom field as steps, or miss a genuinely steps-configured field whose entries don't carry a `step` key exactly as assumed.** → Mitigation: scoped narrowly (array of objects each with a `step` key specifically, not any array-of-objects), tested against the documented example shape; if a real Tuskr project's actual response differs, that's a real, disclosed gap to revisit post-launch, not silently guessed around further.
- **[Risk] No live Tuskr account is available for real end-to-end verification (API access confirmed gated to trial/paid plans only).** → Mitigation: matches the Zephyr Scale/Xray precedent — verification relies on real-but-wrong-endpoint / real-HTTP-error checks, documented as a stated v1 limitation in `docs/integrations.md`, not silently skipped.
- **[Risk] D-T4's process-local rate-limit pacing doesn't coordinate across concurrent importer processes against the same Tuskr account.** → Accepted: this family's per-project-scoped-token deployment model already makes concurrent same-account imports an edge case, not the common path; revisit only if a real user actually hits it.
- **[Trade-off] D-T5's inability to distinguish Dropdown/Multi-select/Text custom fields (no definitions endpoint) means this importer has strictly less field-type fidelity than TestRail/Qase, which do expose typed field metadata.** → Accepted: an honest, disclosed limitation rather than a guessed type table — consistent with how this project has always chosen "don't know" over "assume" for genuinely unverifiable vendor internals.

## Migration Plan

Additive only, matching the other five importers' shape: no new migration, no new `apps/api` routes, no `packages/shared/openapi.yaml` changes. Everything new lives in `tools/import-connector` and the frontend's existing data-driven source list.

Suggested build sequencing:
1. `tools/import-connector/internal/tuskrclient`'s pacer + `ListProjects`/`ListTestSuites`/`ListTestCases` (D-T1/D-T2/D-T4) — TDD against `httptest.Server` response fixtures built from Tuskr's own documented response shapes.
2. `tools/import-connector/internal/importer` — add the `tuskr` mapping branch (D-T2/D-T3/D-T5), reusing the existing dry-run/fake-writer test harness.
3. `internal/poller`/`cmd/import-connector/main.go` — wire the new source (D-T6).
4. `apps/web`: `ProjectsPage.tsx` source-list entry, `ImportProjectPage.tsx` Tuskr Connect-screen fields (tenant ID, Personal Access Token, project ID).
5. `e2e/import-connector.spec.ts` — Tuskr scenarios for the parts reachable without a live account (menu entry, route navigation, Connect form validation), matching the other five importers' own E2E scope limitation.
6. `docs/integrations.md` — extend with the Tuskr section (rate-limit pacing, the steps-shape-detection limitation, the missing-field-definitions limitation); `deploy/compose/docker-compose.yml` and the Helm chart's `import-connector` templates gain a Tuskr-flavored example.

## Open Questions

- **Whether the `customFields` response key for a Steps-type field is ever anything other than `steps`/`stepsWithExpectedResults`** — D-T3's shape-based detection sidesteps needing to know this, but if a real Tuskr account is ever available for testing, worth confirming directly rather than relying solely on the documented example shape.
- **Project addressing for the Connect screen**: whether "Project ID" should be validated against Tuskr's real id format before submission, or left as a plain string the importer resolves (and reports an error for) at dry-run time — TestRail/Kiwi TCMS/Xray precedent (plain id, validated only server-side) suggests deferring client-side validation is acceptable for v1.
