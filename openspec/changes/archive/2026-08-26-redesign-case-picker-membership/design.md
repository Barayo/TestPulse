## Context

`CasePicker.tsx` is the last checkbox-based selection UI in the app after
`add-library-bulk-select` moved the Library away from checkboxes entirely.
Grounded in Pepe/Fable-5 review this session; the user's own framing —
"Checkboxes are ugly, but this selection mode might be too light" — is the
reason this redesign adds a real indicator (circular checkmark) rather than
following the Library's own choice of a bare row tint with no icon at all.

## Goals / Non-Goals

**Goals:** replace the checkbox with a circular checkmark + row tint;
support bidirectional Shift+Click and keyboard range-toggle; keep every
existing accessibility hook (`role="checkbox"`, `aria-checked`,
`aria-label`, disabled semantics) so the three consumer test files don't
need semantic rewrites, only the picker's own test file does.

**Non-Goals:** changing what happens on commit (`SuiteCaseGrid`'s
Save/Cancel, `NewRunPage`'s Create run) — this only touches how a case
enters or leaves the `selected` set before that commit; changing the
section-tree/search/filter mechanics, which are untouched; virtualizing
differently — the existing `computeVisibleRange`/`ROW_HEIGHT`/`OVERSCAN`
windowing is reused as-is.

## Decisions

**D1 — Circular checkmark + tint, not a bare tint.**
Unlike Library's row (a plain `bg-primary/10` tint with no icon, appropriate
for a transient "staged for bulk action" list), suite/run membership is a
standing fact about the case worth a real indicator. A `size-5 rounded-full
border-2` circle, empty (`border-input`) when unchecked, filled
(`bg-primary border-primary`, white checkmark) when checked — plus the same
`bg-primary/10` row tint Library uses, since the row-level signal is still
useful for scanning a long list at a glance. Reuses `lucide-react`'s
`CheckIcon`, no new asset.

**D2 — `bg-primary/10`, not `bg-primary/5`.**
Found live during Pepe's mock verification: `bg-primary/5` (the design
system's own documented "included" tint recipe) is visually
indistinguishable from this palette's `hover:bg-accent` on `--card`. Bumped
to `bg-primary/10` — the same value Library's own selection tint settled
on, so the two features don't disagree on what "selected" looks like
app-wide.

**D3 — Bidirectional Shift+Click, the opposite of Library's additive-only range.**
`add-library-bulk-select`'s range-select is deliberately additive-only —
never removes from a selection, because it's staging targets for a bulk
action (gather, then act). Suite/run membership is different: it's a
standing checkbox-like state, and a range-select must be able to *uncheck*
a range exactly as readily as check one. Semantics: clicking a row's
*resulting* state (the state the click is about to produce — the opposite
of its current `selected.has(id)`) is applied to every case between it and
the last individually-toggled row. Implemented as a new
`onToggleRange(caseIds: string[], checked: boolean)` callback — `CasePicker`
computes the range internally (it already owns the filtered/scoped
`visible` order) and hands the consumer a flat "set these to this state"
instruction, rather than the consumer trying to replicate range math itself.

**D4 — `onToggle` is unchanged; `onToggleRange` is new and required.**
Plain click and Space (first press) still call the existing
`onToggle(caseId)` exactly as today — zero behavior change for the common
single-toggle case, and zero change to `onToggle`'s own call sites'
internal logic. `onToggleRange` is a new, required prop (not optional with
a silent fallback) since both real consumers (`SuiteDetailPage.tsx`,
`NewRunPage.tsx`) implement it in this same change — an optional prop with
implicit fallback behavior would be dead flexibility no caller uses.

**D5 — Keyboard nav needs real scroll math, not `scrollIntoView`.**
`add-library-bulk-select`'s Library list isn't virtualized, so a plain
`element.scrollIntoView()` worked there. `CasePicker` **is** virtualized —
only rows inside `computeVisibleRange`'s current window are mounted at all,
so a ref to an unmounted row is null and `scrollIntoView` is a non-starter.
Instead, moving focus computes the target row's pixel offset
(`targetIndex * ROW_HEIGHT`) and sets `viewportRef.current.scrollTop`
directly, clamped into view — the same direct-scrollTop-assignment idiom
`resetScroll()` already uses in this file, just computing a non-zero target
instead of always resetting to 0.

**D6 — Space/Shift+Space mirror Shift+Click's semantics via roving tabindex; Enter does nothing.**
Only the row at `focusedIndex` has `tabIndex={0}` (every other row `-1`),
and arrow-key navigation calls real `.focus()` on the newly-focused row —
so real DOM focus always tracks the virtual `focusedIndex`. This means
Space and Shift+Space need no separate global handling at all: they land
on the same per-row `onKeyDown` that already handles click/Shift+Click via
`handleRowClick(caseId, e.shiftKey)` (a native Shift+Space keydown carries
`shiftKey: true` exactly like a click would) — simpler than initially
planned, discovered while implementing. Unlike the Library (where Enter
opens the focused case), a picker row has no "open" destination — toggling
the checkbox *is* the row's only action, so Enter is deliberately not
bound to anything; since the row is a real `<button>`, this required an
explicit `e.preventDefault()` on Enter to suppress the browser's own
default button-activates-on-Enter behavior.

**D7 — Remove `ui/checkbox.tsx` as dead code.**
Created during an earlier, since-abandoned mockup iteration in this same
session (before the checkbox-removal direction was settled). Grepped for
any remaining usage across the codebase before removing — confirmed
unused.

## Risks / Trade-offs

- **`onToggleRange` is a required-prop API change to `CasePicker`,
  `SuiteCaseGrid`, and both page-level consumers** — a real (if small)
  refactor surface, mitigated by keeping `onToggle`'s existing behavior and
  call sites completely untouched, so only one new function needs writing
  per consumer (a "set many ids to a state" reducer, structurally identical
  to the existing single-id toggle each already has).
- **Discoverability of Shift+Click/keyboard range-toggle** has no in-row
  affordance (by design, matching Library's own "checkboxes are ugly, don't
  reintroduce clutter" reasoning) — mitigated the same way Library's own
  change was: reusing `RunShortcutsHint`/`RunShortcutsOverlay` inside
  `CasePicker.tsx` itself, so both consumers get the hint for free.
