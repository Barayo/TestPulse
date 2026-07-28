## Context

Every priority pill in the app renders through one shared component,
`ClassificationPills` (`apps/web/src/components/Pills.tsx`, rework-library-ux's
"one set of primitives" decision) — Library rows, `CasePicker`, `SuiteCaseGrid`,
and `CaseDetailPage`'s Properties sidebar all consume it. Today it renders
priority with the exact same flat `bg-muted` treatment as platform and test
type, even though priority is the one property `docs/design-system.md`
already singles out as "scanned at a glance across a list" — the styling
never caught up to that stated intent. User report, with screenshot of the
Library list, asked for priority to actually be colored, across every page
that shows it.

## Goals / Non-Goals

**Goals:** Color-code the 4 priority levels (low/medium/high/critical) by
severity, reusing tokens the app has already validated, applied everywhere
priority renders (one shared component, one fix).

**Non-Goals:** No change to platform/test-type/tag pill styling — they aren't
a severity scale. No new design tokens or hues.

## Decisions

- **Reuse the existing 3-band status system (`status-neutral`/`status-progress`/
  `status-risk`) for low/medium/high**, the same tokens `HealthBar`/`StatusPill`
  already use for pass-rate bands, and `StalePill` already uses for its own
  amber tint. Low borrows the neutral band (health bands have no "low" rung of
  their own, but neutral's "nothing to flag" meaning fits low priority
  directly).
- **Critical reuses `bg-destructive/10 text-destructive`**, not a fourth new
  status band — this exact tint already exists in the codebase today,
  established by `FolderExplorerPage.tsx`'s critical-count pill. Using it here
  means critical priority and "this section has a critical case" already read
  as the same visual signal, which is correct — they're the same underlying
  fact.
- **Color never replaces the label.** Every pill still shows its word
  (`low`/`medium`/`high`/`critical`); color is reinforcement, not the only
  signal — consistent with the app's existing rule that status is never
  color-only.

## Risks / Trade-offs

- [High (status-risk, coral) and Critical (destructive) are visually close in
  hue] → Verified live in both themes; both remain legible and distinct at
  normal size, and each carries its own text label, so the closeness doesn't
  create an accessibility problem — just a deliberately related pair (one
  step more severe than the other, which is the point).
