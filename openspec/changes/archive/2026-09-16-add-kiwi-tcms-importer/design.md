## Context

`add-testrail-importer` (archived) built the first vendor content importer and deliberately made almost everything about it source-opaque: the `import_jobs` table, `apps/api`'s create/poll/claim/patch routes, the poll-not-push control direction, encrypted-credentials handling, the scoped-agent-token claim model, and the browser's data-driven entry-point menu all treat `source` as an arbitrary string. `add-qase-importer` and `add-zephyr-scale-importer` each proved that reusability by adding a source with zero `apps/api` changes — but both were REST APIs, close enough in shape to TestRail's that each new client was a straightforward hand-rolled HTTP+JSON package. This change (Kiwi TCMS, #192) is the first to test that reusability against a genuinely different transport: **XML-RPC**, not REST.

Kiwi TCMS's actual RPC surface was verified against its real, published documentation (`kiwitcms.readthedocs.io`'s `tcms.rpc.api` module reference and source excerpts — not assumed), not just the general concept of "it's XML-RPC." Confirmed facts this design relies on: the RPC endpoint is `/xml-rpc/`; `Auth.login(username, password)` authenticates via Django's own auth system and sets a `sessionid` cookie that every subsequent call must carry (not a bearer token or API key, unlike every prior importer); `TestCase.filter()`'s field list includes `text` but **no structured step field at all**; `TestPlan` supports real parent-child nesting (`parent` field, a `TestPlan.tree()` RPC method); and `TestCase`↔`TestPlan` is a genuine many-to-many relationship via a `TestCasePlan` join table (`TestPlan.add_case()`/`remove_case()` link/unlink, they don't move a case between exclusive containers).

## Goals / Non-Goals

**Goals:**
- Import a Kiwi TCMS product's `TestPlan` tree and its `TestCase`s (with their freeform text and key-value properties) into a TestPulse project, through the exact same Connect → Preview → Result flow and dry-run guarantee the other three importers shipped.
- Add `kiwi-tcms` as a fourth, fully-plugged-in `source` without touching `apps/api`'s schema, routes, or handlers.
- Prove the job/route/report contract really is transport-agnostic, not just REST-shaped — this is the first non-REST source.

**Non-Goals:**
- Run/result history import (`TestRun`/`TestExecution`) — inherits the same deferral as every prior importer, for the same reason (`CaseVersion` rows have no bulk-backfill path).
- Reconstructing Kiwi TCMS's own case edit/version history as TestPulse case versions — an imported case starts at version 1.
- A general-purpose Go XML-RPC client library — this change builds exactly the RPC surface it needs (`Auth.login`, `Product.filter`, `TestPlan.filter`, `TestCase.filter`), not a reusable/complete XML-RPC implementation.
- Preserving the full Kiwi TCMS `TestCase`↔`TestPlan` many-to-many relationship — TestPulse has no case-sharing-across-folders concept (every prior importer already assumes one case, one container); see D-K4.
- Custom field *type* fidelity — Kiwi TCMS has no typed custom-field concept to begin with (see D-K5), so there is no downgrade-or-drop table like the other three importers have; every property is a string.

## Decisions

**Inherited unchanged from the prior three importers:**
- Control direction: the importer polls `apps/api`; `apps/api` never calls the importer.
- `apps/api` owns the generic `import_jobs` table; `source: "kiwi-tcms"` is just another opaque value in the existing `source text` column — no migration.
- The same `POST/GET .../import-jobs[/{jobId}]` (browser-facing) and `GET/PATCH /import-jobs` (agent-facing) routes, unchanged, no new `packages/shared/openapi.yaml` surface.
- Per-project-scoped agent token model (one importer deployment per target project).
- Attribution: the job's `created_by` records the authorizing human; imported content is attributed to the importer's own agent identity.
- Progress UI: count-up against `progress_current`/`progress_total`, tight poll interval.

**D-K1: A hand-rolled, minimal XML-RPC codec against `encoding/xml` — no third-party XML-RPC library.**
Every prior client (`testrailclient`, `qaseclient`, `zephyrscaleclient`) is hand-rolled against Go's standard `encoding/json` specifically to avoid an SDK dependency for "an API simple enough not to need one" (established precedent, `establish-architecture`'s "all stack additions must be open source" plus this project's own demonstrated preference). XML-RPC has no standard-library support in Go, so *some* new capability is unavoidable here — the question is whether that's a third-party library or a hand-rolled minimal codec. Considered:
- *(Rejected)* `kolo/xmlrpc` — the most established Go XML-RPC client, but confirmed (checked its own repo state) to be in minimal-maintenance mode with no active development; taking on a permanent dependency on an unmaintained library for a production feature is a worse trade than the alternative.
- *(Rejected)* `alexejk.io/go-xmlrpc` or similar smaller alternatives — individually-maintained, lower adoption, same long-term-maintenance-risk shape as `kolo/xmlrpc`, just newer.
- *(Chosen)* A minimal hand-rolled codec using only `encoding/xml`: marshal a `<methodCall>` with the handful of param shapes this importer actually sends (strings, ints, and one `<struct>` for `filter()`'s query-dict argument), and unmarshal the handful of response shapes it actually reads (`<struct>`/`<array>` of structs, string scalars). This is bounded, testable work — not a general XML-RPC implementation — and matches this project's own established "narrow, no SDK" pattern rather than fighting it for the one client that happens to need a different wire format.

**D-K2: Auth — `Auth.login` plus a cookie jar, not a bearer token; site URL required (self-hosted, like TestRail).**
Confirmed via Kiwi TCMS's own RPC/auth documentation: `Auth.login(username, password)` authenticates through Django's session auth and returns/sets a `sessionid` cookie — every subsequent RPC call on the same connection must carry it, or the server treats the caller as anonymous. `kiwitcmsclient.New` constructs an `*http.Client` with a `net/http/cookiejar.Jar` (standard library, no dependency) and calls `Auth.login` once at client construction; every later call reuses the same client, so the cookie travels automatically. Since Kiwi TCMS is a self-hosted open-source product with no fixed vendor endpoint (unlike Qase/Zephyr Scale Cloud), the Connect screen requires a site URL, matching TestRail's own Connect screen shape more than Qase's/Zephyr Scale's. Credentials map: `siteUrl`, `username`, `password`.

**D-K3: Domain mapping — a product's `TestPlan` tree (root plans, walked recursively via `parent`) maps directly to a nested Folder tree, same shape as Qase's/Zephyr Scale's direct-tree pattern.**
`TestPlan.filter({'product': id, 'parent__isnull': True})` finds a product's root plans; each child plan (`TestPlan.filter({'parent': planId})`) nests beneath its parent's mapped Folder, recursively — no intermediate "suite vs. section" split (TestRail's D6 problem doesn't apply here, same as Qase/Zephyr Scale). One Kiwi TCMS **Product** is this importer's unit of import, addressed by name via `Product.filter({'name': ...})`, matching the "one vendor-project scopes one TestPulse-project's structure" pattern every prior importer established.

**D-K4: A case linked to multiple test plans in the imported scope is created once, in the first plan encountered by the walk — every multi-plan case is named individually in the report, never silently deduped or duplicated.**
Kiwi TCMS's `TestCase`↔`TestPlan` relationship is genuinely many-to-many (confirmed: a `TestCasePlan` join table, `add_case()`/`remove_case()` link/unlink rather than move). TestPulse has no equivalent — every prior importer already assumed one case belongs to exactly one container, and TestPulse's own domain model has no case-sharing-across-folders concept to preserve this with. Two options were considered:
- *(Rejected)* Duplicate the case into every linked plan's folder as separate TestPulse cases. Rejected: silently multiplies the case count in a way a QA lead reviewing the dry-run's counts wouldn't expect, and duplicated cases immediately diverge (editing one doesn't affect the "other" — they're not actually linked once imported), which misrepresents the source data more than it preserves it.
- *(Chosen)* Import each case exactly once, into whichever mapped plan-folder is reached first during the depth-first walk (a deterministic, if somewhat arbitrary, choice — first-encountered order, not "primary" in any Kiwi TCMS sense). Every case that was linked to more than one plan within the imported scope is named individually in the report (by its Kiwi TCMS `summary`) as "imported into one of N linked plans" — matching this importer family's core promise (TestRail D7/Qase D-Q4/Zephyr Scale D-Z5's "never silently lose information without saying so"), just applied to a structural relationship instead of a field value this time.

**D-K5: A case's freeform `text` field (no structured steps in Kiwi TCMS at all) is preserved in the case's description, mirroring Zephyr Scale's script-only-case precedent.**
Confirmed against `TestCase.filter()`'s own field list: there is no steps array, no structured procedure of any kind — `text` (a single freeform string) is the only field describing what the test does. This is architecturally the same situation `add-zephyr-scale-importer`'s D-Z3 already solved for a script-only case: rather than force-fitting freeform prose into a fake single step (misrepresenting it as structured when it isn't) or dropping it (real data loss), the case's `text` is appended to the imported case's `Description`, and the case's `Steps` list is empty.

**D-K6: Custom field mapping — every property maps to `text`, no downgrade-or-drop table needed at all.**
Kiwi TCMS has no typed, project-scoped custom-field concept the way TestRail/Qase/Zephyr Scale do — `TestCase.properties()` (backed by `add_property()`/`remove_property()`) is a flat set of arbitrary key-value string pairs per case, with no schema, no type, no site-wide definition to fetch. There is nothing to classify as mappable-or-not: every property name becomes (or reuses) a TestPulse `text` custom field, and its value is copied verbatim. This is the simplest custom-field story of the four importers precisely because Kiwi TCMS's own property model is simpler (and less structured) than the other three vendors'.

**D-K7: `tools/import-connector` package layout — `internal/kiwitcmsclient` alongside the three REST clients, sharing `internal/testpulseclient` and the poller/config skeleton unchanged.**
Mirrors the established layout: a new client package (`internal/kiwitcmsclient`, this time with its own XML-RPC codec rather than a thin JSON wrapper), and `internal/importer` gains a `kiwi-tcms` branch (selected by the claimed job's `source`) implementing D-K3/D-K4/D-K5/D-K6. `internal/config`, `internal/poller`, `internal/testpulseclient`, and `cmd/import-connector/main.go` are unchanged in shape (poller gets one more `New*Client`/branch, exactly like the prior three additions).

**D-K8: Trademark — same conservative pattern as the other three, applied by default; Kiwi TCMS's own policy not yet independently verified.**
No published Kiwi TCMS trademark/brand-usage policy was found during this design pass (same situation as Qase/Zephyr Scale). Applies the identical conservative pattern: generic tool name (`tools/import-connector`, `--source=kiwi-tcms`), "Import from Kiwi TCMS" as plain referential UI copy, no Kiwi TCMS logo, `docs/integrations.md` and the Connect screen carry the same disclaimer-footnote treatment. Tracked under the same standing concern issue (#195) as the other three.

**D-K9: In-app entry point — one more array entry, no new UI primitive.**
Matches every prior importer's D8/D-Q7/D-Z8: "Import from Kiwi TCMS" is a fourth entry in the same data-driven source list (menu → `/projects/import/kiwi-tcms`, the existing `/projects/import/:source` route, unchanged). The Connect screen's credential fields are rendered per-source: site URL + username + password (closer to TestRail's shape than Qase's/Zephyr Scale's, per D-K2).

## Risks / Trade-offs

- **[Risk] The hand-rolled XML-RPC codec (D-K1) is new, untested-by-precedent surface area — a real implementation risk none of the prior three importers carried.** → Mitigation: scoped to exactly four RPC calls with known, documented response shapes (verified against Kiwi TCMS's real API docs, not assumed) — not a general XML-RPC implementation. TDD per this project's standing practice: the codec's marshal/unmarshal logic gets its own focused unit tests against literal XML-RPC wire-format fixtures before any client method is built on top of it.
- **[Risk] D-K4's "first-encountered, not duplicated" resolution for multi-plan cases is a real, visible behavior a QA lead might not expect.** → Mitigation: named explicitly in the dry-run report (not silently absorbed into the "cases" count), and documented in `docs/integrations.md`'s "what it does and doesn't import" section, matching how every prior importer's own real limitations are disclosed rather than glossed over.
- **[Trade-off] No custom-field type fidelity concerns exist for this importer (D-K6), unlike the other three.** → Not a risk, just a genuine difference: Kiwi TCMS's own property model is simpler than TestRail/Qase/Zephyr Scale's, so there's no "downgrade or drop" decision to get wrong.
- **[Risk] Kiwi TCMS session-cookie auth (D-K2) means a client that fails `Auth.login` must surface a clear, distinguishable error** (bad site URL vs. bad credentials vs. network failure) rather than a generic RPC fault. → Mitigation: `kiwitcmsclient.New`'s login call is a distinct step with its own error wrapping, tested separately from the data-fetching RPC calls.

## Migration Plan

Additive only, matching the other three importers' shape: no new migration, no new `apps/api` routes, no `packages/shared/openapi.yaml` changes. Everything new lives in `tools/import-connector` and the frontend's existing data-driven source list.

Suggested build sequencing:
1. `tools/import-connector/internal/kiwitcmsclient`'s XML-RPC codec (D-K1) — marshal/unmarshal against literal wire-format fixtures, TDD, before any RPC method is built on it.
2. `internal/kiwitcmsclient`'s RPC methods (`Login`, `ListProducts`/`FindProduct`, `ListTestPlans`, `ListTestCases`) on top of the codec, TDD against an `httptest.Server` returning real Kiwi TCMS XML-RPC response bodies (captured from the documentation's examples).
3. `tools/import-connector/internal/importer` — add the `kiwi-tcms` mapping branch (D-K3/D-K4/D-K5/D-K6), reusing the existing dry-run/fake-writer test harness.
4. `apps/web`: `ProjectsPage.tsx` source-list entry, `ImportProjectPage.tsx` Kiwi TCMS Connect-screen fields (site URL, username, password).
5. `e2e/import-connector.spec.ts` — Kiwi TCMS scenarios for the parts reachable without a live account (menu entry, route navigation, Connect form validation), matching the other three importers' own E2E scope limitation.
6. `docs/integrations.md` — extend with the Kiwi TCMS section and disclaimer; `deploy/compose/docker-compose.yml` and the Helm chart's `import-connector` templates gain a Kiwi TCMS-flavored example.

## Open Questions

- **Whether `TestPlan.tree()` itself (rather than repeated `filter({'parent': ...})` calls) is a more efficient way to fetch the whole plan hierarchy in one RPC round trip** — left to implementation; functionally equivalent either way, `tree()` just batches what would otherwise be N recursive calls. Not a design-level decision, a performance detail to resolve once real Kiwi TCMS response shapes are being handled in code.
- **Product addressing**: whether the Connect screen should look up the product by exact name (case-sensitive?) or require a numeric product id the user must find some other way — TestRail's own precedent (a plain numeric id, D9's open question in that design) suggests starting with a numeric id is acceptable for v1, deferring a friendlier lookup to a later pass, consistent with how TestRail's own Connect screen still hasn't upgraded past that either.
