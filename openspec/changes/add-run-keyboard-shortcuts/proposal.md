## Why

As a tester, when I execute a run of dozens or hundreds of items, I want to record a verdict and move to the next item without reaching for the mouse each time. Today the run execution board (`RunPage` + `RunItemDetailPage`) is mouse-only — there is no keyboard path to record a verdict or move between items — even though this is ROADMAP.md's "one polished screen" for v0.1 and the highest-frequency screen in the product. Competitive research on established open-source test-management tools named single-key verdict recording with auto-advance, plus `j`/`k` list navigation, as the pattern that defines a modern execution screen (TestRail, Testmo). Closes #82.

## What Changes

- Single-key verdict recording on `RunItemDetailPage`: `P` = pass, `F` = failed, `B` = blocked, `S` = skipped, `R` = retest (only when the item is `failed`, matching the existing "Retest" button's visibility rule). Recording a verdict via a keyboard shortcut immediately advances to the next pending item in the run, without a manual click back to the list. The existing on-screen buttons keep their current stay-on-page behavior unchanged — this auto-advance is scoped to the keyboard flow only.
- `j`/`k` navigation between run items: on `RunPage`'s list, moves a focus cursor up/down the visible (filtered/grouped) item list, `Enter` opens the focused item; on `RunItemDetailPage`, moves to the previous/next item in the run's current item order without returning to the list first.
- Shortcuts are disabled while any text input, textarea, or the actor-override field has focus, so typing "b" in a comment does not record "blocked" — the same guard already used for other keyboard handling in the app (e.g. `FolderTree`, `CasePicker`).
- A visible, persistent shortcuts hint on both pages (footer legend), plus a `?` key that opens a shortcuts overlay listing every available key — this is not a hidden power-user feature.

## Capabilities

### New Capabilities

(none — this extends the existing run execution board and item detail page requirements)

### Modified Capabilities

- `test-execution`: the "Run execution board" and "Run item detail page" requirements gain keyboard-shortcut behavior — single-key verdict recording with auto-advance, `j`/`k` navigation, and shortcut discoverability.

## Impact

- `apps/web/src/pages/RunItemDetailPage.tsx` — verdict-recording keyboard handler, auto-advance-to-next-pending-item logic, prev/next item navigation, shortcuts hint/overlay.
- `apps/web/src/pages/RunPage.tsx` — list focus-cursor state, `j`/`k`/`Enter` handling, shortcuts hint/overlay.
- A new shared component for the shortcuts hint/overlay, reusable across both pages.
- No API or schema changes — this is a client-side interaction layer over the existing verdict-recording and item-listing endpoints.
- `docs/test-management.md` — document the new shortcuts.
- `apps/api/internal/sampledata/seed.go` — not applicable (no new seed content needed; existing sample runs already have enough items to demonstrate multi-item navigation).
