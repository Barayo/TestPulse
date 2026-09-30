## Context

Verified directly against current code (research grounding, not the issue text):

- 12 tools registered today (`write_tools.go:53-90`, `read_tools.go:17-38`). Output shapes: 8 return a `domain.*` struct directly, 3 wrap an array in a named field purely to satisfy MCP's object-root output schema requirement (`BulkAddCasesOutput`, `SearchOutput`, `ListProjectsOutput` — see each type's own comment) while still embedding `domain.*` unmodified, and 1 (`UpdateSuiteMembershipOutput`, shipped this session in `add-mcp-suite-membership-tool`) is already a bespoke, ID-safe type.
- Per-struct audit of every domain struct reachable through MCP (`domain.go`): `Project` (ID+Key only), `Run` (`ProjectKey`/`SuiteKey`/`TestPlanKey` already present, `TestPlanID` is `json:"-"`), and `RunSummary` (`RunID` only, redundant since the caller already supplied `runKey` as input) are already clean. Seven are not:
  - `TestCase` (domain.go:645): `ProjectID` — no `ProjectKey` sibling on this struct. `FolderID` — no key sibling, and no folder concept exists anywhere in the 12-tool MCP surface to substitute.
  - `Suite` (domain.go:704): `ProjectID` and `CaseIDs []string` — the latter already fixed once, but only in the bespoke `UpdateSuiteMembershipOutput`; `upsert_test_suite`'s own `domain.Suite` output still leaks both today.
  - `StepGroup` (domain.go:218): `ProjectID` only.
  - `Result` (domain.go:949, `record_result`'s output): `RunItemID` — no run-item-key concept exists anywhere (confirmed: `RunItem` has no `Key` field; `findRunItemByCaseKey`, write_tools.go:395-406, always resolves items by the composite `(runKey, caseKey)` pair, never by item ID).
  - `SearchResult` (domain.go:1083, `search`'s output): `ProjectID` only.
  - `Release` (domain.go:741, `get_details`-only reachable today): `ProjectID` only.
  - `TestPlan` (domain.go:767, `get_details`-only reachable today): `ProjectID` only (`ReleaseID`+`ReleaseKey` is already a correct pair on the same struct — good existing precedent, left alone).
  - `bulk_add_cases`'s `BulkAddCasesOutput.Cases []domain.TestCase` (write_tools.go:289-291) transitively inherits `TestCase`'s leak — this wrapper embeds the struct unmodified, so fixing `TestCase` alone doesn't fix this call site; the wrapper's field type must change too.
- `get_details` (read_tools.go:66-78) has `ToolHandlerFor[GetDetailsInput, any]` — no static output type at all, dispatching to whichever of 6 domain structs `Service.GetDetails` resolves to (service.go:249-289: case/suite/run/project/release/testPlan) and serializing it as-is, inheriting whichever of the above leaks that entity type has.
- No existing batched ID→key lookup exists anywhere in the store layer (`grep` for `*ByIDs`/`KeysByIDs` on `ProjectRepo` — none). Every existing ID→key resolution goes through a full single-entity fetch (e.g. `svc.GetProject(ctx, id).Key`). The codebase does have an established precedent for computing something over a result set with one batched query rather than N (domain.go:717's comment on `Suite.PassRate`/`LastRunAt`: "computed via one batched query per List/Get call, not one query per suite") — same pattern to follow for `search`'s project-key resolution, since a single `search` call can return matches spanning many distinct projects.

## Goals / Non-Goals

**Goals:**
- Every MCP tool output field that is a raw internal ID must either have a usable key substitute or not exist in the MCP output at all.
- `search`'s project-key resolution must not perform one project lookup per result row — batch by distinct project ID.
- `get_details` must apply the same conversion for all 6 of its dispatch targets, not just the ones already covered by another tool's fix.
- `Suite`'s two touching tools (`upsert_test_suite`, `update_suite_membership`) return the identical output type.

**Non-Goals:**
- Giving `get_details` a fully-typed, statically-declared output schema (a discriminated union across 6 entity types isn't expressible through the MCP Go SDK's per-tool single generic output type). Its Go-level output type stays `any`; only the *values* it returns are fixed. This is a separate, pre-existing schema-strictness gap.
- Adding a folder concept to the MCP tool surface just to give `TestCase.FolderID` somewhere to go — it's dropped instead.
- Adding a run-item-key concept to the domain model just to give `Result.RunItemID` somewhere to go — dropped instead, replaced by the caller-supplied `RunKey`/`CaseKey` it already knows.
- Retrofitting the REST API's JSON responses — this change is MCP-output-only; REST keeps returning `domain.*` structs as-is (REST's own established convention already allows browsing entities by internal ID via other means, which MCP does not need to mirror).

## Decisions

**D1 — Dedicated output types over documentation-only.** The issue itself posed this as an open trade-off. Rejected alternative: document that `key` is the only usable identifier and leave `id` fields in place. Rejected because it leaves the actual confusion (and the risk of an agent trying a raw ID as input and hitting an opaque not-found error) in place — pure prose can't be verified by a test, while a type-level fix can. This codebase already committed to the higher bar once, in `UpdateSuiteMembershipOutput` (this session, `add-mcp-suite-membership-tool`); this change generalizes it rather than leaving it as a one-off inconsistency.

**D2 — Field substitution table** (new type name → domain source → change):
| New type | Source | Change |
|---|---|---|
| `TestCaseOutput` | `TestCase` | `ProjectID`→`ProjectKey`; `FolderID` dropped; all other fields (`Key`, `CurrentVersion`, `Content`, `CreatedAt`, `UpdatedAt`, `Jira*`) unchanged |
| `SuiteOutput` | `Suite` | `ProjectID`→`ProjectKey`; `CaseIDs`→`CaseKeys`; `Key`, `Name`, `PassRate`, `LastRunAt`, `CreatedAt` unchanged — supersedes `UpdateSuiteMembershipOutput` (renamed/expanded, not left as a second parallel type) |
| `StepGroupOutput` | `StepGroup` | `ProjectID`→`ProjectKey`; `Key`, `Name`, `Steps`, `CreatedAt`, `UpdatedAt` unchanged |
| `ResultOutput` | `Result` | `RunItemID` dropped, replaced by `RunKey`+`CaseKey` (values the handler already has from its own input, not looked up); all other fields unchanged |
| `SearchResultOutput` | `SearchResult` | `ProjectID`→`ProjectKey` (batch-resolved, D3); `EntityType`, `Key`, `Name`, `Rank` unchanged |
| `ReleaseOutput` | `Release` | `ProjectID`→`ProjectKey`; `Key`, `Name`, `Description`, `Status`, `CreatedAt` unchanged |
| `TestPlanOutput` | `TestPlan` | `ProjectID`→`ProjectKey`; `ReleaseID` dropped (`ReleaseKey` already present and sufficient); `Key`, `Name`, `Description`, `CreatedAt` unchanged |

`Project` and `Run` need no twin — already clean (Context).

**D3 — Batched project-key resolution for `search`.** Add `Service.ProjectKeysByIDs(ctx, ids []string) (map[string]string, error)`, backed by a new `ProjectRepo` store method doing one `SELECT id, key FROM projects WHERE id = ANY($1)`. The `search` handler collects the distinct project IDs across all results once, calls this one time, then maps each result's `ProjectID` through the returned map — one query regardless of result-set size, matching the `Suite.PassRate`/`LastRunAt` precedent (Context).

**D4 — `get_details` converts by type-switch, keeps `any` as its declared Go output type.** After `Service.GetDetails` resolves to one of the 6 domain structs, the handler switches on the concrete type and converts it to the matching new `*Output` type before returning — e.g. `domain.TestCase` → `TestCaseOutput`, `domain.Release` → `ReleaseOutput`. `domain.Suite`/`domain.Run`/`domain.Project` resolve to `SuiteOutput`/`Run` (unchanged, already clean)/`Project` (unchanged, already clean) respectively. Rejected alternative: give `get_details` its own separate, `get_details`-specific set of output types instead of reusing the ones built for the dedicated tools — rejected as pure duplication; the same entity has the same usable shape regardless of which tool returned it.

**D5 — `Result` gains caller-known `RunKey`/`CaseKey` instead of dropping `RunItemID` silently.** `record_result`'s handler already resolved `RunKey`→`runID` and has `CaseKey` from its own input (`RecordResultInput`, write_tools.go:408-413) before calling `svc.RecordResult` — attaching those two values back onto the returned `ResultOutput` costs nothing extra (no new lookup) and makes the result self-descriptive without the caller needing to remember which run/case it just called for.

**D6 — `bulk_add_cases` output updated in lockstep with `TestCaseOutput`.** `BulkAddCasesOutput.Cases` changes from `[]domain.TestCase` to `[]TestCaseOutput`; the handler maps each created case through the same conversion `upsert_test_case` uses. No new type needed — this is a call-site update, not a new decision surface.

## Risks / Trade-offs

- **[Risk]** Seven new types plus one wrapper-type field change is a mechanical but sizeable diff across two files. → **Mitigation**: each type is a direct, boring field-for-field mapping per D2's table — no new business logic, and each gets its own task/test in tasks.md so the diff lands incrementally, not as one large unreviewable blob.
- **[Risk]** Existing test `TestMCPSearchFindsMatchesAndRespectsProjectScoping` asserts `results[0].ProjectID != visible.ID` directly (`mcp_scenarios_test.go:858`) — this line breaks once `SearchResult`'s wire field becomes `projectKey`. → **Mitigation**: update that assertion to compare `results[0].ProjectKey` against `visible.Key` as part of this change's own task list, not a surprise found later.
- **[Risk]** `get_details`'s output staying declared as `any` means MCP clients relying on advertised `outputSchema` still see nothing there for this tool — unchanged from today, not a regression, but also not improved by this change (Non-Goals).

## Migration Plan

Additive/substitutive only — no schema change, no migration file. Every affected tool's *response shape* changes (raw ID fields removed/renamed), which is a breaking change to any MCP client parsing those specific fields — acceptable because this tool surface has no external published clients yet (v0.1, agents are TestPulse's own MCP-server-driven flows, no versioned public MCP client contract exists to preserve). No REST/openapi impact, so no version bump needed there.
