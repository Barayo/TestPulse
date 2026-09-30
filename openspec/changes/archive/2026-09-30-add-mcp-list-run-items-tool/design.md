## Context

Verified directly against current code:

- `Service.RunItemsPage(ctx, runID, assignee, cursor, limit string/int) ([]domain.RunItem, string, error)` (service.go:1579-1581) already exists — cursor-paginated, backs REST's `GET /runs/{runKey}/items` (`handlers.go:904-915`). `Service.RunItems` (no pagination) exists separately for run comparison, which needs a run's complete item set; not what this tool should use.
- REST's `listRunItems` handler: `parsePageParams(r)` reads `cursor`/`limit` query params, clamping `limit` via `store.ClampLimit` (default 50, max 200, `pagination.go:14-15`); `newPagePayload(items, nextCursor)` wraps the response as `{items: [...], nextCursor: <string or explicit null>}` (`server/pagination.go:26-41`) — an established convention (`add-cursor-pagination`), not something to invent fresh here.
- `domain.RunItem` (domain.go:901-934): `ID` (no key sibling — no run-item-key concept exists anywhere, confirmed by `fix-mcp-output-id-leaks`'s research), `RunID` (no sibling; caller already has `runKey` as input), `CaseID` (sibling `CaseKey` exists), `CaseVersion`, `Assignee *domain.Assignee`, `CurrentStatus`, `Content` (pinned version's case content), `NewerVersion`, `TestName`, `CreatedAt`, `JiraIssueKey`/`JiraIssueSummary`/`JiraIssueStatus`/`JiraLastSyncedAt`, `StepStates`, `TestDataRow`.
- `domain.Assignee` (domain.go:892-899): `Kind`, `ID` (internal actor-ref ID — no MCP tool anywhere accepts an assignee ID as input, and no assignee-key concept exists; same "dead-end ID" shape as `Result.RunItemID`), `Name`, `AvatarKey`.
- `get_run_progress` (`read_tools.go`, closest existing precedent for a run-scoped read tool) resolves `runID` via `svc.RunIDByKey`, then `svc.ProjectIDForRun`, then `svc.Authorize(ctx, domain.PermRead, projectID)` — exact permission and resolution pattern to reuse.
- REST's `assignee` filter (`RunRepo.Items`/`ItemsPage`, store/runs.go:702-720,788-817) matches against `i.assignee_user_id::text`/`i.assignee_team_id::text` — a raw internal UUID, not a key or email. No MCP tool anywhere in the current 12-tool surface exposes a user or team ID an agent could supply here (no "list users"/"list teams" tool exists). Passing this filter through as originally planned would mean shipping an input parameter with no way for an agent to discover a valid value — the same "dead-end ID" problem `fix-mcp-output-id-leaks` eliminated on the output side, just on the input side instead.
- Tool count before this change: 12 (confirmed via `add-mcp-human-readable-results`'s own verification). This change adds the 13th.

## Goals / Non-Goals

**Goals:**
- Expose run-item enumeration via MCP, cursor-paginated from the start, reusing `Service.RunItemsPage` and REST's own pagination envelope shape (no new pagination convention invented).
- New output type is ID-safe from day one (no raw `ID`/`RunID`/`CaseID`/assignee-ref-ID), matching the bar `fix-mcp-output-id-leaks` established for every other entity type.

**Non-Goals:**
- `jiraLinked` filtering — REST's other `listRunItems` query param, not requested by the issue; skip for now.
- **`assignee` filtering — dropped from this tool's scope entirely** (not merely deferred): it would require a raw internal user/team UUID an agent has no way to obtain from any other tool today (Context). Revisit only alongside a future user/team-listing capability that could supply a usable key for it.
- Any change to `Service.RunItemsPage`, `RunItemsJiraLinked`, or the REST handler — all reused as-is (called with a constant empty-string assignee filter, matching "no filter" in the store layer's own `$2 = ''` check).
- Retrofitting `search`/`list_projects` with pagination (issue #149, tracked separately) — this change only ensures the *new* tool doesn't repeat that gap.

## Decisions

**D1 — Reuse `Service.RunItemsPage`, not `Service.RunItems`.** `RunItems` (unpaginated) exists specifically for run comparison's need for a complete item set; it is not the right backing method for a tool an agent might call against a run with hundreds of items. `RunItemsPage` is already production-proven via REST. Called with a constant empty-string assignee argument (Non-Goals) — no assignee filtering in this tool's input.

**D2 — Mirror REST's own pagination envelope exactly: `{items: [...], nextCursor: string|null}`.** Rejected alternative: a bespoke MCP-specific pagination shape (e.g. `hasMore: bool` instead of a cursor) — rejected because it would be a second, inconsistent pagination convention in the same codebase for no benefit; an agent calling both REST and MCP against the same backend should see one shape.

**D3 — `RunItemOutput` field mapping**: drop `ID`, `RunID`, `CaseID` (keep `CaseKey`); drop `Assignee.ID` specifically inside a new `AssigneeOutput{Kind, Name, AvatarKey}` (keeping `Assignee` itself, since `Kind`+`Name` are genuinely useful for an agent deciding who a failing item is assigned to — only the internal ref ID is dead weight, same reasoning as `Result.RunItemID`'s removal). All other `RunItem` fields pass through unchanged (`CaseVersion`, `CurrentStatus`, `Content`, `NewerVersion`, `TestName`, `CreatedAt`, `Jira*`, `StepStates`, `TestDataRow`).

**D4 — Permission: `domain.PermRead` on the run's project**, identical to `get_run_progress` — this is a read tool exposing data already visible via REST to anyone with read access; no new permission concept needed.

**D5 — Result text summary** (`add-mcp-human-readable-results` convention, already established): `"Found %d item(s) in run %s"` (count, run key) — no new lookups, matching every other tool's zero-new-calls bar.

## Risks / Trade-offs

- **[Risk]** `RunItemOutput`'s `Content` field (full pinned case content) makes each item's payload larger than a bare case-key+status pair would be — for a run with `MaxPageLimit` (200) items, this could be a sizeable response. → **Mitigation**: accepted for v1, matching REST's own `listRunItems` response shape exactly (REST doesn't trim `Content` either); an agent that only needs case keys and statuses can ignore the rest, and trimming would mean this tool's shape diverges from REST's for no clear benefit. Revisit only if real-world payload size becomes a problem.

## Migration Plan

Additive only — no schema change, no migration file, no changes to existing tools or REST routes.
