## Context

`#100` (`add-run-item-assignment-ui`, later `link-run-item-assignee-to-identity`)
already built the run board's multi-select infrastructure — per-row
checkboxes, a header "select all" scoped to whatever filter is active,
`RunPage.tsx`'s `selectedIds` state, and `RunBulkActionBar` with a single
**Assign selected…** action that opens `AssignDialog`. `#83`'s original
scope covered both bulk assignment and bulk status verdicts; assignment
was carved out to `#100` on 2026-07-31 specifically so it wouldn't block
shipping the assignee UI. This change is the remainder: bulk verdicts.

Individual verdict recording (`recordVerdict` in `RunItemDetailPage.tsx`)
already exists and is the reference behavior: `POST
/api/v1/items/{itemId}/results` with `{verdict, comment, actor?}`,
gated on the run being open and the caller holding `runRecordResult`.

## Goals / Non-Goals

**Goals:**
- Apply one verdict to every selected item in a single action, from the
  bulk action bar already on the run board.
- Preserve the append-only result-log guarantee exactly: a bulk verdict
  produces one real result row per item, not a batch/summary record —
  indistinguishable in History from that many individual recordings.
- Reuse the existing multi-select state and the existing per-item
  results endpoint; no new backend endpoint, no new database concept.

**Non-Goals:**
- A comment field for a bulk verdict. A comment is inherently specific
  to one item's context ("still failing after retry" doesn't generalize
  across five different cases); forcing one comment string onto every
  selected item would produce noise in History, not signal. Individual
  recording keeps the comment field; bulk does not.
- An actor-override ("record on behalf of") field for a bulk verdict.
  Same reasoning as comment — kept out of v1 to keep the bulk action a
  single deliberate click with nothing to fill in, not a mini-form. Can
  be added later if requested; nothing here forecloses it.
- Any change to the multi-select infrastructure itself (checkboxes,
  select-all, filter scoping) — that's `#100`'s work, reused as-is.

## Decisions

**The four verdicts collapse into one "Mark as ▾" dropdown, not four
separate buttons.** The first pass shipped four flat outline buttons
(`Mark N Pass`, `Mark N Failed`, `Mark N Blocked`, `Mark N Skipped`)
alongside `Assign selected…` — rejected on review: all five actions had
identical visual weight (no reuse of the per-item verdict buttons'
existing color language — Pass=primary, Failed=destructive,
Blocked/Skipped=outline — see `RunItemDetailPage.tsx`), the selection
count was stated five times in one row (once as "N selected", then
again inside each of the four button labels), and a flat action array
doesn't scale as more bulk actions get added later (this row has
already grown once, from assign-only to +4 verdicts). Replaced with a
single `Mark as ▾` trigger built on `RowActionMenu` — the dropdown/menu
component already used for per-row actions elsewhere on this board —
extended with an optional `trigger` prop so it can render a labeled
button instead of its default "⋯" icon. Each menu item shows a status
dot in the same color as `StatusBadge`'s `dotClass` (now exported for
reuse) instead of inventing new color logic, and carries no count in
its label — "N selected" on the bar already states it once. `Assign
selected…` stays its own separate button, since it's a different kind
of action (ownership, not execution state), not folded into the menu.

**No confirmation modal before a bulk verdict fires.** Individual
verdict recording already requires zero confirmation — clicking Pass on
one item just records it. A bulk verdict is the same operation applied
to a deliberately-selected set, and the write is not destructive: it's
an append to history, and current_status can always be corrected by a
later recording, the same recovery path that already exists for a
mis-clicked individual verdict. This is the one real judgment call in
this change — happy to add a confirm step if it turns out to feel too
easy to misfire in practice.

**One `POST /api/v1/items/{itemId}/results` call per selected item, via
`Promise.all`.** Mirrors `assignRunItems.ts`'s existing fan-out for bulk
assignment exactly. No new "bulk verdict" endpoint — the result log has
no concept of a batch, only individual rows, and it should stay that
way; a bulk verdict is a client-side convenience over N individual
writes, not a new server-side primitive.

**Bulk verdict actions only render when the run is open**, matching
every other verdict-recording control on the board. `RunBulkActionBar`
doesn't need to change to support this: its `actions` array is already
built by the caller (`RunPage.tsx`), so the four verdict entries are
just conditionally spread into that array when `!isClosed`, the same
pattern `RunItemDetailPage.tsx` already uses to conditionally show
Retest. Bulk assignment itself isn't gated by run status today (per
`#100`) and stays that way — out of scope for this change to alter.

**Right-click on a row that's part of an active multi-selection shows
the bulk menu; right-click on any other row is unaffected.** Explored
via a Fable-5-assisted mock (three interaction options) before
building: the menu a right-click opens depends solely on whether the
clicked row is currently checked, computed in `RunItemRow` right where
`menuItems` is already built (`selected && selectedCount > 1`). A
checked row (with more than one item selected) gets the bulk menu:
`Assign N selected…`, a divider, then the same `verdictMenuItems` array
the bulk bar's dropdown already builds — literally the same array, not
a re-derived copy, so both entry points stay in sync automatically. An
unchecked row always gets today's single-item menu (`Open execution`,
`Go to case in Library`, `Assign to…`), regardless of whether other
rows happen to be selected. The checkbox selection itself is **never**
mutated by a right-click — no silent add-to-selection, no silent
replace — since these checkboxes are a deliberate, sticky selection the
user built by clicking, not a transient last-click selection the way
some file managers treat it; changing it as a side effect of a
right-click would undermine the mental model of "what am I about to do
to my N checked items?" Two rejected alternatives: silently merging the
right-clicked row into the selection (bigger interaction bet, threads
new state-mutation paths into a component that currently only reads
selection state), and a stacked single+bulk menu showing both sets of
actions at once (forces parsing an "N vs N+1" distinction inline for no
added value over the simpler either/or rule).

## Risks / Trade-offs

- **One slow/failing item stalls the whole batch's perceived
  completion** — `Promise.all` rejects if any individual POST fails,
  same behavior bulk assignment already has (not a new risk, but worth
  naming): a partial failure isn't currently reported per-item. Matching
  existing bulk-assign behavior for consistency rather than solving
  partial-failure UX here; a future change could report per-item
  results if this becomes a real problem in practice.
- **No confirmation step, discussed above** → accepted given the
  non-destructive, always-correctable nature of a result log entry.
- **Pass/Failed go from one click to two** (open the dropdown, then
  pick) since they're no longer standalone buttons — a real cost of
  collapsing into a menu, accepted in exchange for the bar staying
  legible as more bulk actions get added over time.
