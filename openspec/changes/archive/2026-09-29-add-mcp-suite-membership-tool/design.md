## Context

Verified directly against current code (research grounding for this change, not the issue text or stale docs):

- `Service.AddCaseToSuite(ctx, suiteID, caseID string) error` (`apps/api/internal/service/service.go:1113-1125`): resolves both IDs' project via `store.Suites.ProjectID`/`store.Cases.ProjectID`, rejects with `invalid("case belongs to a different project")` if they differ, then calls `store.Suites.AddCase`, then audits `"add_case"`/`"suite"`.
- `Service.RemoveCaseFromSuite(ctx, suiteID, caseID string) error` (service.go:1127-1138): calls `store.Suites.RemoveCase`, audits `"remove_case"`/`"suite"`. No cross-project check needed — removal is inherently safe.
- Store layer (`apps/api/internal/store/suites.go:379-390`): `AddCase` is `INSERT ... ON CONFLICT DO NOTHING` (idempotent — re-adding an existing member is a silent no-op, not an error); `RemoveCase` is a plain `DELETE` (no-op if the case wasn't a member). Neither checks suite/case existence directly — callers are expected to have already resolved keys to IDs (which they have, via key→ID lookups the tool handler performs before calling the service).
- REST (`apps/api/internal/server/handlers.go:99-103,597,602`): `PUT /suites/{suiteKey}/cases/{caseKey}` → `addCaseToSuite`, `DELETE /suites/{suiteKey}/cases/{caseKey}` → `removeCaseFromSuite`, both gated by `domain.PermSuiteEditMembership` (`domain.go:1186`), no request body — both keys come from the path.
- MCP tool template: `upsertTestSuite` (`write_tools.go:198-234`) is the closest existing analog — resolves `SuiteKey` → ID via `svc.SuiteIDByKey`, then project ID via `svc.ProjectIDForSuite`, then `svc.Authorize(ctx, domain.PermSuiteEditMembership, projectID)`, calls the service method, returns the domain struct via `sdkmcp.ToolHandlerFor[Input, Output]`. Registration is `sdkmcp.AddTool(srv, &sdkmcp.Tool{...}, handlerFn)` inside `registerWriteTools` (write_tools.go:53-89).
- Read-side today: `get_details` for `entityType: "suite"` returns `domain.Suite.CaseIDs []string` — raw internal case UUIDs, not case keys (`SuiteRepo.Get`, suites.go:69-100). This is a pre-existing instance of issue #148 (MCP UUIDs aren't usable as input), not introduced by this change — but this change's own result must not repeat it.
- Run-pinning: confirmed safe — `CreateRun` (service.go:1367-1408) reads `suite.CaseIDs` once at run-creation time and builds run items from that snapshot. Later membership changes never affect already-created runs.
- Tool count ground truth: 11 tools registered today (7 write in `write_tools.go:53-89`, 4 read in `read_tools.go:17-38`). `docs/mcp-server.md`'s "Twelve" prose and `ROADMAP.md`'s stale name list (missing `upsert_step_group`) are both already wrong, independent of this change.
- No existing precedent for one MCP tool branching on an explicit action enum — the closest pattern is `upsert_*`'s "behavior branches on which key is present." REST itself is two verbs (PUT/DELETE) on one resource, which maps most directly onto a single tool with an `action` field.

## Goals / Non-Goals

**Goals:**
- Expose suite-membership editing (add/remove a case) as one new MCP tool, `update_suite_membership`.
- Match REST's existing permission (`PermSuiteEditMembership`) and no-op semantics (duplicate add / non-member remove) exactly — no new error behavior invented at the MCP layer.
- Return case keys (not internal UUIDs) in the result, so the new tool's output is actually usable as input elsewhere (unlike the pre-existing `get_details` suite leak).
- Correct the stale tool-count documentation in `docs/mcp-server.md` and `ROADMAP.md` as part of this change, since it's touched anyway and both are already wrong.

**Non-Goals:**
- Fixing `get_details`'s existing UUID leak for suites (`domain.Suite.CaseIDs`) — tracked separately as issue #148, out of scope here. This change only ensures its own new code doesn't add to that problem.
- Bulk membership operations (e.g. "set suite's full membership to this list of case keys in one call") — REST doesn't offer this either; out of scope. One case per call, matching REST's own PUT/DELETE-per-case shape.
- Any change to `Service.AddCaseToSuite`/`RemoveCaseFromSuite` or the store layer — both are reused as-is.

## Decisions

**D1 — One tool with an `action` enum, not two tools.** `update_suite_membership` takes `suiteKey`, `caseKey`, and `action: "add" | "remove"`. Rejected alternative: two tools (`add_case_to_suite`, `remove_case_from_suite`) — more consistent with "one verb per tool," but pushes the tool count to 13 instead of 12, and the two operations share 100% of their key-resolution/permission-check code with only the terminal service call differing. A single tool with a branch on `action` keeps the coarse-grained tool-surface philosophy (ROADMAP.md) intact while still fully covering REST's two verbs.

**D2 — No-op, not error, for redundant add/remove.** Adding an already-member case, or removing a non-member case, both succeed silently and return the suite's current membership — directly inherited from the store layer's existing `ON CONFLICT DO NOTHING`/plain-`DELETE` behavior (D1's alternative of surfacing these as errors would require the tool to run an extra existence check the store layer doesn't otherwise need, purely to reject something REST itself never rejects).

**D3 — Result shape: return the suite's current, full membership as case keys.** After the add/remove call, the tool re-fetches the suite (`svc.GetSuite`) and maps `CaseIDs` → case keys before returning, rather than returning only a bare success boolean. Rationale: an agent editing membership over multiple calls benefits from seeing the resulting state directly, without a separate `get_details` round-trip — and since `get_details`'s existing UUID leak is out of scope to fix, this is the one place in this change where key-resolution work is unavoidable (need it to avoid *introducing* a fresh leak in new code, per Goal 3).

**D4 — Cross-project rejection surfaces as a permission-shaped error, matching REST.** `AddCaseToSuite`'s existing `invalid("case belongs to a different project")` (D1's alternative) is returned as-is through the tool's error path — no new validation added, no swallowing of this error into a generic failure. Matches REST's existing behavior exactly since both call the identical service method.

**D5 — Cache-key idempotency (`add-mcp-idempotency-keys`) is deliberately NOT wired into this tool.** Non-goal set explicitly here rather than left implicit: `update_suite_membership`'s add/remove operations are already naturally idempotent at the store layer (D2) — a retried "add" call is safe to repeat with no `idempotencyKey` at all, unlike the strictly-creates-a-new-record tools (`upsert_test_case`'s create path, `bulk_add_cases`, `create_test_run`) that motivated the idempotency-key feature. Adding an unnecessary `idempotencyKey` param here would be scope creep with no behavior it actually protects.

## Risks / Trade-offs

- **[Risk]** A single `action`-enum tool is slightly less discoverable in a tool-list UI than two separately-named tools (an agent has to know both a tool name and a valid enum value). → **Mitigation**: the tool's description and the enum's own jsonschema description spell out both accepted values; this matches the existing `upsert_*` pattern's own implicit "behavior varies by presence of a key" discoverability trade-off, already accepted by this codebase.
- **[Risk]** Returning full suite membership on every call means the response grows with suite size (a suite with thousands of cases produces a long key list on every single add/remove call). → **Mitigation**: accepted for v1 — matches existing suites' realistic scale (the largest documented suites are in the low hundreds of cases); revisit if a future large-suite pagination need is filed (would piggyback on issue #149's pagination work, not duplicate it here).

## Migration Plan

Additive only — no schema change, no migration file. New tool registration is a pure addition to `registerWriteTools`; existing tools, REST routes, and service/store methods are unchanged.
