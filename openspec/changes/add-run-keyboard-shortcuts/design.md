## Context

The run execution board (`RunPage`, item list) and the run item detail page
(`RunItemDetailPage`, verdict recording) are two separate React pages joined
by client-side routing (`/runs/:runKey` and `/runs/:runKey/items/:caseKey`).
Neither page currently listens for keyboard events beyond native browser/DOM
behavior. Verdict recording (`recordVerdict`) and item listing already exist
and are unchanged by this design — this is purely a client-side interaction
layer on top of them.

## Goals / Non-Goals

**Goals:**
- Let a tester record a verdict and move to the next unexecuted item without
  touching the mouse.
- Let a tester move between items — from the list, and from within an
  item's own page — without returning to the list each time.
- Make every shortcut discoverable without prior knowledge.

**Non-Goals:**
- No new API endpoints or schema changes; this consumes the existing item
  list and result-recording endpoints as-is.
- No customizable/rebindable key bindings — the five verdict keys and `j`/`k`
  are fixed, matching the fixed set of existing on-screen buttons.
- No bulk actions (multi-select + shortcut) — that is #83, a separate change.

## Decisions

**Item ordering source of truth.** Both pages already fetch
`GET /runs/{runKey}/items`, which returns items in a stable, deterministic
order (creation order). `RunPage` already holds this as `items` state;
`RunItemDetailPage` currently discards the full list after finding the
matching item. This design keeps the full ordered list in
`RunItemDetailPage`'s state too, so both pages navigate items in the exact
same order — a tester moving from the list to an item and back sees a
consistent sequence.

**Auto-advance target: next pending item, forward-only, no wrap.** After
`recordVerdict` succeeds, search the ordered item list starting just after
the current item's index for the first item with `currentStatus ===
'pending'`. If found, navigate to it. If none remain, navigate back to
`RunPage` — the run (or at least everything after the current point) is
done, and returning to the list shows that at a glance. Rejected
alternative: wrapping around to search from the start. Wrapping risks
silently re-visiting an already-triaged item after a `retest` was marked
elsewhere in the run, which reads as the app "skipping around" rather than
progressing — forward-only with a return to the list when done is the more
predictable behavior for a linear triage workflow.

**Auto-advance applies to the keyboard shortcuts only, not the on-screen
buttons.** An earlier draft of this design auto-advanced on any verdict
recording, by key or by click, on the premise that the buttons should
"work the same as" the shortcuts. That premise was wrong: the existing
on-screen Pass/Failed/Blocked/Skipped buttons have never auto-advanced —
they record and leave the tester on the item's page, and #82's own scope
was specifically the keyboard flow (mirroring TestRail's single-key
pattern), not a change to mouse behavior. Implementing uniform auto-advance
broke four existing, already-spec'd scenarios that depend on staying on
the item page after a button click (seeing the result appear in history,
then clicking Retest). `recordVerdict` now takes an `advance` flag: the
keyboard handler passes it, the on-screen buttons don't, so button clicks
keep their exact pre-existing behavior and only the keyboard flow gets the
speed benefit it was scoped for.

**`j`/`k` is plain sequential browsing, independent of auto-advance.**
Unlike the verdict shortcuts' auto-advance (which specifically hunts for the
next *pending* item), `j`/`k` moves strictly to the previous/next item in
list order regardless of status — this is a browsing shortcut, not a triage
shortcut, so it must be able to revisit already-executed items.

**Keyboard-guard scope.** A shortcut handler ignores the event entirely
when `document.activeElement` is an `<input>`, `<textarea>`, or has
`isContentEditable`. This matches the existing guard idiom already used in
`FolderTree`/`CasePicker` for their own local arrow-key handling, so typing
"b" or "s" into the comment box or the actor-override field never fires a
verdict. No new focus-trap or `preventDefault` on unrelated keys is needed.

**Discoverability: persistent footer legend + `?` overlay.** A slim,
always-visible footer strip lists the active shortcuts for the current page
(e.g. `P pass · F failed · B blocked · S skipped · R retest · ?  all
shortcuts` on the item page). Pressing `?` opens a lightweight dialog with
the full list, dismissed with `Escape` or another `?`. This is the same
"visible teach-in" principle already applied to the right-click context menu
work — an interaction with no visible affordance does not get discovered.

**One shared component.** `RunShortcutsHint` (footer legend) and
`RunShortcutsOverlay` (the `?` dialog) are built once and used by both
pages with a page-specific shortcut list passed in as props, rather than
duplicating the legend/dialog markup.

## Risks / Trade-offs

- **Retest key (`R`) only applies conditionally** (item must be `failed`),
  same as today's Retest button — the footer legend on `RunItemDetailPage`
  SHALL omit `R` from the visible list when the item isn't `failed`, so the
  hint never advertises a key that would silently no-op.
- **`j`/`k` vs. browser/OS shortcuts** → neither key collides with a
  standard browser shortcut; scoped to a `keydown` listener on the page
  container, not `window`, so it never fires while focus is outside the
  run pages.
- **Auto-advance leaving the item page abruptly** could disorient a tester
  who wanted to review the item they just recorded → the existing result
  history is already visible on the item page before the verdict is
  recorded, and the append-only result log remains reachable from the run
  list at any time, so nothing is lost, only navigation is sped up.
