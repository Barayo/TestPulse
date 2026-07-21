## 1. RunPage: pinned-version caption

- [x] 1.1 Write a failing test in `apps/web/src/pages/RunPage.test.tsx`: the item detail pane
      shows "Pinned version" as a label and "v{n}" as its value in separate elements (not one
      prose sentence). Confirm the existing `findByText(/newer version/i)` assertion still
      passes unmodified.
- [x] 1.2 Replace the `<p>Pinned at v{n}...</p>` line with `<PropertyRow label="Pinned version"
      value={`v${selected.caseVersion}`} />` plus a conditional "A newer version of this case
      exists" line when `selected.newerVersion`. Make 1.1 pass; ran the full `RunPage.test.tsx`
      suite (13/13) to confirm no regression.

## 2. Docs: StatusPill vs. Badge vs. PropertyRow

- [x] 2.1 Added the decision section to `docs/design-system.md` (StatusPill = derived status
      band, Badge = user-set fixed enum, PropertyRow = everything else), plus a "not every
      scalar value belongs in a PropertyRow" note recording why `ProjectsPage.tsx`'s card
      description and `ProjectPage.tsx` (which doesn't render description at all) were
      deliberately left unconverted. Also corrected the Property rows section's opening
      sentence, which had aspirationally listed "a project's description" as an existing
      PropertyRow example before this change made that claim true (for the run pin) or
      documented false (for descriptions).

## 3. Final verification

- [x] 3.1 `make lint`, full web test suite (399/399), typecheck, and `make coverage-web`
      (92.4%/80.1%/91.6%/95.0%) all pass.
- [x] 3.2 Close GitHub issues #51 and #52, referencing this change, once archived.
