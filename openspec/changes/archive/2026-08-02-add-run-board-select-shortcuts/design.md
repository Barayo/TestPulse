## Context

The run board's multi-select infrastructure (`#100`, `#103`) already ships
per-row checkboxes, a header "select all" scoped to the active filter,
`selectedIds` state, and a bulk action bar (`RunBulkActionBar`) offering
"Assign selected…" and "Mark as ▾" (`#83`). Separately, `#82` added keyboard
navigation: `j`/`k` move a `focusedIndex` cursor through `displayOrder` (the
flattened, filter/group-respecting item order), `Enter` opens the focused
item, and `isEditableElementFocused()` guards all of it so shortcuts never
fire while typing in a textarea.

The founder flagged that the row checkbox renders at full opacity
unconditionally — visually competing with row content (title, tags, assignee,
status) on every one of the board's rows, even though selection is usually
inactive. Three design passes with Pepe (Senior UX/UI reviewer, Fable-5
model) worked through the resting-state treatment and two additional
selection gestures before landing here.

## Goals / Non-Goals

**Goals:**
- Reduce the row checkbox's visual weight at rest without reducing its
  reliability as a selection entry point for any input device.
- Add Space (toggle the focused row) and Shift+click (range-select) as
  conventional list-selection shortcuts, consistent with Gmail/Finder-style
  UIs, on top of the existing checkbox/select-all mechanisms — not replacing
  them.
- Reuse all existing selection state (`selectedIds`, `displayOrder`,
  `focusedIndex`) rather than introducing a parallel selection model.

**Non-Goals:**
- Touch/tablet-specific selection gestures (long-press, swipe) — out of
  scope; this board's primary usage is desktop triage.
- Changing what a selection is *for* (bulk assign, bulk verdict) — that's
  `#100`/`#83`'s existing scope, untouched here.
- Persisting `lastToggledId` across page loads or across the row list being
  regrouped — it resets naturally on remount, matching how `focusedIndex`
  already behaves.

## Decisions

**Row checkboxes recede to ~0.4 opacity at rest; they do not disappear.**
Two more aggressive alternatives were evaluated and rejected:

1. *Fully invisible at rest* (opacity 0, same reserved slot, fading in only
   on hover or the `j`/`k` focus cursor). Pepe's own first-pass recommendation
   was the milder always-dimmed version; asked to push further toward
   removal, he built this variant and flagged its real risk explicitly: a
   checkbox invisible until a user is already looking at that exact row can
   go undiscovered by anyone who only glances at rows without lingering —
   softer than full removal's problem, but the same shape of problem. The
   founder preferred to keep the checkbox visibly (if quietly) present at
   rest rather than accept that risk.
2. *Remove per-row checkboxes entirely*, keeping only a "Select all"
   control restyled as a text link, with Shift+click and Space as the sole
   per-row selection mechanisms. Requested explicitly and evaluated
   adversarially — hard rejected on three independent grounds:
   - **No subtraction path.** `toggleSelectAll` is atomic (none↔all); with
     checkboxes gone, deselecting a subset after "Select all" (e.g. bulk-mark
     8 of 10 items Pass, skip 2 still pending review) has no O(1) mechanism
     for a mouse-only user — the only guaranteed path is `j`/`k` to each row
     plus Space, which doesn't exist at all without keyboard navigation.
   - **No discoverable single-row select.** With the row's plain click
     already meaning "open the item," the only way left to select exactly
     one row (not all, not a range) is Shift+click relying on the no-anchor
     fallback — a completely undiscoverable modifier-key interaction with
     zero on-row affordance hinting it exists.
   - **A link is the wrong affordance family.** "Select all" is a stateful,
     repeatable, bulk-mutating action; every other control on this page is a
     button, checkbox, or context-menu item. Restyling it as a hyperlink
     undersells its own weight and breaks the page's own vocabulary for
     side-effecting controls.

   The always-dimmed checkbox solves the same stated problem (visual noise
   at rest) as both rejected alternatives without introducing either's gap:
   it stays an O(1) select/deselect target for any input device, on every
   row, all the time — just visually quiet until something draws attention
   to that row (hover, `j`/`k` focus) or a selection is already underway
   (every row's checkbox goes full-opacity once `selectedCount > 0`, not
   only the hovered one, so the whole list stays legible mid-triage). The
   header "Select all" checkbox is exempt from dimming — it's a deliberate,
   list-level destination paired with the "Showing N of M items" summary
   line, not per-row scan noise, so full-opacity there doesn't reintroduce
   the visual-noise problem this change is solving.

**Space toggles the `j`/`k`-focused row; Enter is unchanged.** Space is
unclaimed on this board today and idiomatically means "mark this one" in
every list UI that also supports Enter-to-open (Gmail, Superhuman, Finder).
Implementation piggybacks on the existing `handleKeyDown` effect and its
`isEditableElementFocused()` guard — no new guard logic, no new state beyond
calling the existing `toggleSelect(displayOrder[focusedIndex].id)`. Needs
`e.preventDefault()` since Space scrolls the page by default.

**Shift+click unions a range from a new `lastToggledId` anchor; falls back
to single-select with no prior anchor.** `toggleSelect` today is a pure
XOR with no memory of what was last touched. A new `lastToggledId` (or
index) is tracked alongside `selectedIds`, updated on every plain
checkbox toggle. Shift+click computes the slice of `displayOrder` between
that anchor and the newly-clicked item and **adds the whole range to the
existing selection** — union, not replace, not XOR — matching the
Finder/Gmail convention: filter to Failed, select a run of five, Shift+click
to extend, still able to individually toggle one more item afterward. The
first-ever Shift+click (no anchor set yet) selects just the clicked row and
becomes the new anchor, rather than being undefined — this was flagged as a
correctness gap regardless of which resting-state option shipped.

**No new visual state for the focused/hover-revealed checkbox beyond what
was already mocked.** The existing `focused` prop (driving the left accent
bar + `bg-accent` background on the `j`/`k`-cursored row) already reads as
"this row is armed" — Space acting on it needs no additional visual
signal layered on top.

## Risks / Trade-offs

- **At 0.4 opacity the checkbox needs to read as *quiet*, not *disabled*** —
  it sits next to already-muted row content (tags, "Unassigned") using the
  same `--muted-foreground` family. Verify live against the real row; if it
  reads as broken/greyed-out rather than calm, nudge toward ~0.5 rather than
  revisiting the resting-state decision itself.
- **A Shift+click range suddenly selecting 5–10 rows snaps that many
  checkboxes to full opacity in one paint.** Treated as intended behavior,
  not a bug to soften — the whole reason "any active selection → every
  checkbox full-opacity" exists is to broadcast "you're in selection mode"
  across the list in one visual change.
- **`displayOrder` reflows when "Group by status" is toggled mid-selection.**
  A Shift+click range computed against one ordering, followed by a group
  toggle, must not produce a stale or surprising range on the next
  Shift+click — verify live before considering this done, since it's the one
  interaction path not fully covered by unit tests against a static list.
