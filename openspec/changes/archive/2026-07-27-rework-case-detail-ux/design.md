## Context

`CaseDetailPage.tsx` already has the app's established full-entity-page shell
(Breadcrumbs + `grid grid-cols-1 md:grid-cols-[1fr_320px]`), but its sidebar predates
the pill vocabulary `SuiteCaseGrid` introduced for the suite-membership rework: priority
is a bare shadcn `Badge`, everything else is plain text. Research this session (TestRail,
Xray, Linear, GitHub) confirmed two consistent patterns worth adopting: page-level
actions (delete/duplicate/move) always live on the record's own page, never only on a
list row; and richer tools render priority/status as color, not plain text. A
Pepe/Fable-5 mockup (`mockup.html`, this directory), user-approved, is the visual/
interaction source of truth.

## Goals / Non-Goals

**Goals:**
- Properties sidebar visually matches the pill vocabulary already shipped
  elsewhere (Suites, Library).
- Page-level Move to…/Delete actions, reusing existing endpoints and the
  existing `RowActionMenu` component — not a new interaction pattern.
- A lightweight, free (already-loaded-data) change signal on version history
  rows, with an inline expand for the actual diff.
- Edit mode preserves the sidebar's read context instead of a full-page
  takeover.

**Non-Goals:**
- No "Duplicate" action — doesn't exist anywhere in the app; inventing it here
  would be scope creep beyond a visual/navigational rework.
- No real result-history data — `add-case-result-history` (separate, future)
  owns wiring actual data into the Results panel; this change only improves the
  placeholder's copy/chrome.
- No change to version-pinning semantics, edit/save mechanics, or the
  `VersionDetailDialog`'s own full diff view — the inline row-level signal is a
  hint, not a replacement for that dialog.

## Decisions

- **Move to…/Delete reuse the Library row menu's exact actions, not a
  redesigned set.** Every other full-entity page's "why can't I act on the
  thing I'm looking at" gap gets closed the same way case-by-case; inventing
  new case-level actions (duplicate, archive, etc.) here would be a different,
  larger proposal.
- **Version-history diff signal is computed client-side from data already
  fetched** (`CaseVersion.content` per version, already loaded for the
  history list) — free, no new endpoint. Reuses `VersionDetailDialog.tsx`'s
  existing `SCALAR_FIELDS` + step-comparison logic rather than a second diff
  implementation; factor it into a shared helper if that's cleaner than
  duplicating the field list.
- **Edit mode keeps the two-column shell.** Left column becomes Title + Steps
  editor (unchanged mechanics); right column keeps the same three sections,
  with only Properties morphing into an inline form — Results and Version
  History stay visible read-only. Trade-off: more surface area to keep in
  sync than a full-page form swap, judged acceptable since Results/Version
  History don't interact with the edit form at all.

## Risks / Trade-offs

- [Diff signal logic drifting out of sync with `VersionDetailDialog`'s own
  diff if implemented as a second copy] → Extract a shared diff helper during
  implementation rather than copy-pasting `SCALAR_FIELDS`.
- [Sidebar-preserving edit mode is more code than a full-page swap] →
  Acceptable; Results/Version History render identically in both modes, so the
  only real duplication is the Properties section's read vs. edit rendering,
  which already exists as two separate code paths today.

## Migration Plan

Pure frontend change, no schema/API impact. Ships as a regular deploy.
