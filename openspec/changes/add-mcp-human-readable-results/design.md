## Context

Verified directly against the vendored SDK (`go-sdk@v1.7.0/mcp/server.go:394-443`, `AddTool`'s generated handler): after a `ToolHandlerFor[In, Out]` returns `(res, out, nil)`, the SDK marshals `out` into `res.StructuredContent` unconditionally. Separately, *only if* `res.Content == nil`, it also stuffs that same JSON into a `TextContent` block as `content[0].text` — this is the raw-JSON-dump behavior the issue describes. Supplying a non-nil `res` with `Content` already set (returned instead of `nil`, as every handler in this codebase does today) short-circuits that fallback, while `StructuredContent` is set from `out` exactly the same either way. Confirmed empirically to be an all-12-tools issue: every handler in `write_tools.go`/`read_tools.go` (from `fix-mcp-output-id-leaks`, just shipped) returns `nil` as its first value.

## Goals / Non-Goals

**Goals:**
- Every tool's successful call produces a short, one-sentence, human-readable summary in `content[0].text`.
- Zero new service/store calls — every value used in a summary line is already resolved in-handler before the existing return statement.
- `StructuredContent` (what the calling model parses) is byte-for-byte unaffected.

**Non-Goals:**
- Rich/multi-line formatting, Markdown, or templating infrastructure — one plain sentence per tool is sufficient (issue's own "What good looks like" example is a single line).
- Changing error-path formatting — errors already go through the SDK's own `SetError`, untouched by this change.
- A shared "entity summary" abstraction spanning tools — each tool's line is written directly in its own handler; the values in scope differ enough (a batch count here, a verdict there) that a generic formatter would add indirection without saving real duplication.

## Decisions

**D1 — A tiny helper, not a new abstraction.** Add `func textResult(format string, args ...any) *sdkmcp.CallToolResult` in `write_tools.go`, returning `&sdkmcp.CallToolResult{Content: []sdkmcp.Content{&sdkmcp.TextContent{Text: fmt.Sprintf(format, args...)}}}`. Every handler's success path changes its first return value from `nil` to `textResult(...)`. Rejected alternative: a per-tool struct implementing some `Summary() string` method — over-engineered for one sentence per tool; a `Sprintf` call inline is simpler to read at each call site.

**D2 — Per-tool summary line content** (built only from values already in scope at the return statement):
| Tool | Summary line |
|---|---|
| `upsert_test_case` | Create: `"Created case %s: %s"` (key, title). Edit: `"Edited case %s to version %d: %s"` (key, version, title) |
| `upsert_step_group` | Create: `"Created step group %s: %s (%d steps)"`. Edit: `"Edited step group %s: %s (%d steps)"` |
| `upsert_test_suite` | Create: `"Created suite %s: %s"`. Rename: `"Renamed suite %s to %s"` |
| `update_suite_membership` | `"Added case %s to suite %s (%d cases total)"` / `"Removed case %s from suite %s (%d cases total)"` |
| `bulk_add_cases` | `"Created %d cases in %s"` (count, project key) — individual keys are already in `StructuredContent`; the summary line only needs the count for a batch, matching the issue's own single-line example |
| `create_test_run` | `"Created run %s: %s"` (key, name) — no case count: `domain.Run` doesn't carry an item count, and computing one would need a new lookup, contradicting the zero-new-calls goal |
| `record_result` | `"Recorded %s for case %s in run %s"` (verdict, case key, run key) |
| `update_run_item_status` | `"Set case %s in run %s to status %s"` |
| `search` | `"Found %d match(es) for %q"` (count, query) |
| `get_details` | `"Fetched %s %s"` (entityType, key) — the entity type varies per call, so the line stays generic rather than duplicating each dedicated tool's richer format |
| `get_run_progress` | `"Run %s: %d/%d pass"` (run key, `Counts[domain.StatusPass]`, `Total`) — no percentage field exists on `RunSummary` (Context); a raw count ratio is simpler than computing and rounding a percentage for a one-line summary |
| `list_projects` | `"Found %d accessible project(s)"` |

**D3 — Idempotency-cache replay paths reuse the same line, not a special "(cached)" marker.** `upsert_test_case`/`bulk_add_cases`/`create_test_run`'s idempotency-key replay branches (`add-mcp-idempotency-keys`) return the same cached `Out` value either way; the summary line is generated from that value identically whether freshly created or replayed, since the line only describes the resulting entity, not how it was produced. Rejected alternative: a distinct "(replayed from idempotency key)" suffix — adds a special case for a distinction the caller's own request (same key twice) already tells them, and the line would need plumbing to know whether the idempotency branch was taken.

## Risks / Trade-offs

- **[Risk]** A hardcoded `Sprintf` per handler is mildly repetitive across 12 tools. → **Mitigation**: accepted — each line's inputs differ enough (batch count vs. verdict vs. entity type) that a shared formatter would need as many branches as call sites; the plain, explicit version reads clearly at each site (design.md D1).

## Migration Plan

Additive only — no schema change, no migration file, no `StructuredContent` change. Existing clients parsing `structuredContent` are unaffected; only the previously-redundant raw-JSON `content[0].text` (which duplicated `structuredContent`) changes shape.
