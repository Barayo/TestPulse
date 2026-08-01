## Context

`RunPage.tsx` already has client-side filtering (a `Status | null` active
filter) and grouping over `items` state loaded once at mount — no server
round-trip per filter change. The backend's `assignee` query param on
`GET /runs/{runKey}/items` exists but is overloaded: an empty string means
"no filter," not "filter to unassigned," so it cannot express an
Unassigned query today. `AssignItem`/`PUT /items/{itemId}/status` already
handles a single item; there is no bulk-assign endpoint.

Issue #83 ("Bulk actions on the run execution board") is still unbuilt and
was rescoped (2026-07-31) to multi-select infrastructure + bulk status
verdicts only, after bulk assignment was absorbed into this change. Since
#83 hasn't shipped yet, this change is the first to need row-level
multi-select on the board at all.

## Goals / Non-Goals

**Goals:**
- Make the existing assignment capability usable from the UI: assign,
  see who's assigned, filter by assignee including Unassigned.
- Bulk-assign multiple items in one action.
- Set every item's assignee at run-creation time without extra clicks
  per item afterward.

**Non-Goals:**
- No change to the `assignee` field's type or storage — stays free text.
  The User/Team reference upgrade is #103, a separate change.
- No new bulk-assign API endpoint — bulk assignment is a client-side loop
  over the existing single-item endpoint (see Decisions).
- No permission-model changes — assigning continues to require
  `runRecordResult`, same as recording a result, per the existing spec
  requirement. Whether it deserves its own flag is explicitly deferred
  (#103), not decided here.
- Bulk status-verdict actions (#83's remaining scope) are not implemented
  here — only the selection state and action-bar shell they'll plug into.

## Decisions

**Assignee filtering stays entirely client-side.** `RunPage` already holds
the full `items` array in state (used for the existing status filter and
grouping). Rather than fix the backend's ambiguous empty-string-means-no-
filter query param, the assignee filter chips (including Unassigned) are
computed and applied client-side, exactly like the existing status filter.
This avoids touching a query param whose current meaning other API
consumers may already rely on, and keeps every filter on the board using
one consistent mechanism.

**Bulk assign is a client-side loop over the single-item endpoint, not a
new bulk API.** Run sizes in this app are small (the Sample Project's
largest run has 10 items); a `Promise.all` of individual `PUT
/items/{itemId}/status` calls is simple, reuses the existing permission
check and audit path per item, and avoids designing a new endpoint and
its own partial-failure semantics for a change explicitly scoped to be
UI-only. Rejected alternative: a new `POST /runs/{runKey}/items/bulk-
assign` endpoint — deferred until a real run size makes N individual
calls a genuine problem; nothing here prevents adding one later.

**Multi-select selection state and the bulk action bar are built here,
generically, for #83 to extend.** This change needs multi-select to
support bulk assignment; #83 will need the same selection state for bulk
status verdicts. Rather than each change inventing its own selection
model, this change owns `selectedIds: Set<string>` state and a bulk
action bar component (`RunBulkActionBar`) that renders whatever actions
are passed to it — this change passes only "Assign to…"; #83 adds a
"Mark as…" verdict action to the same bar later. Rejected alternative:
build assignment's own one-off multi-select and let #83 duplicate it —
rejected because the two features sit on the exact same board list and a
tester should be able to select once and see both actions available, not
switch between two different selection UIs depending on which action they
want.

**Default assignee at creation reuses the per-item assign call, not a new
creation-time field.** `NewRunPage` already gets back the created run's
key; after creation, if a default assignee was entered, the page fetches
the run's items and applies the same bulk-assign loop used on the board.
Rejected alternative: add `RunInput.DefaultAssignee` server-side — would
require a backend change for a convenience the client can already achieve
by sequencing two existing calls, and this change is scoped to stay UI-
only.

**AssignDialog suggests recent assignees via a plain HTML `<datalist>`,
not a search dialog.** `UserPicker` (used for team membership) picks from
real registered users — using it here would misrepresent free-text
`assignee` as a real identity lookup, which it isn't yet (that's exactly
what #103 will change it into). A `<datalist>` populated from assignee
values already present in the run's own items gives fast reuse ("ana" is
one keystroke away the second time) without implying a capability that
doesn't exist yet.

## Risks / Trade-offs

- **N sequential/parallel PUT calls for bulk assign** → acceptable at
  today's run sizes (see Decisions); revisit with a real bulk endpoint if
  run sizes grow materially before #103 lands.
- **Selection state built for #100, extended by #83** → couples the two
  changes' implementation order (#83 should build on top of
  `RunBulkActionBar` rather than re-deriving it) → mitigated by keeping
  `RunBulkActionBar` a small, generic, well-scoped component (a list of
  actions in, a selection-count label, nothing assignment-specific baked
  in) so #83 genuinely just adds a button.
- **Free-text assignee filter chips could grow unbounded** on a run with
  many distinct assignee strings (typos, inconsistent capitalization) →
  acceptable for v1 given today's small team sizes; #103's real-identity
  upgrade removes the typo class of problem entirely, so no special
  handling (truncation, "show more") is added here.
