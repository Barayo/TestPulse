## Context

The app already has a partial icon vocabulary — `FolderIcon` (Section),
`FileTextIcon` (Test Case), `LayersIcon` (Suite), `CirclePlayIcon` (Run) —
applied consistently in `ProjectLandingPanels.tsx` and `RolesPage.tsx`, but
inconsistently or not at all elsewhere. A Pepe/Fable-5 design pass (asked
directly: should every entity type get its own icon?) investigated the real
DOM/code, found no cross-entity list or search surface in the app that would
justify building a full icon-per-entity system (every entity list today is
single-type — Suites lists only suites, Runs lists only runs), and
recommended against building one. It did find these 3 concrete violations of
the *existing* vocabulary, independent of that broader answer.

## Goals / Non-Goals

**Goals:** Fix the 3 confirmed vocabulary violations so the existing partial
icon system is actually consistent where it already claims to apply.

**Non-Goals:** No new icon-per-entity system, no color-coding by entity type,
no icons in breadcrumbs (Pepe: horizontal space is scarce there and position
already disambiguates type) — all explicitly rejected by the design pass.

## Decisions

- Reuse the exact vocabulary already established (`LayersIcon` = Suite,
  `FileTextIcon` = Test Case), not new icons — this is a consistency fix,
  not a redesign.
- Apply the same `size-4 text-muted-foreground` (list rows) / `size-3.5`
  (inline link) treatment already used elsewhere, not a new visual style.

## Risks / Trade-offs

None of note — this is a same-day, low-risk visual fix touching 3 lines
across 3 files with no logic change.
