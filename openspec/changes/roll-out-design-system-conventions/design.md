## Context

`PropertyRow` (`apps/web/src/components/PropertyRow.tsx`) and its usage rule were written for
`CaseDetailPage.tsx`'s sidebar — a spacious, single-item detail context. The full-app UX audit
that raised issues #51 and #52 named specific candidate sites to check; this change checks each
one against the actual current code rather than assuming the issue's premise holds.

## Goals / Non-Goals

**Goals:**
- Apply `PropertyRow` where a site is a genuine match for the pattern's original context
  (spacious, single-item, sidebar/detail-pane-style).
- Document the `StatusPill` vs. `Badge` vs. `PropertyRow` decision so the next page doesn't
  have to re-derive it from three components' worth of existing usage.

**Non-Goals:**
- Forcing `PropertyRow` onto every candidate site regardless of fit. A card-grid's compact
  description line and a sidebar's labeled property row solve different problems; the
  pattern's own documented rule (`docs/design-system.md`, "Property rows") is about *scalar
  properties in a spacious context*, not a mandate to label every rendered value everywhere.
- A full second UX audit. This change closes out #51/#52 specifically, not a fresh pass.

## Decisions

**`RunPage.tsx`'s pinned-version caption converts; `ProjectsPage.tsx`'s description doesn't.**
The run item detail pane (`RunPage.tsx`, inside `data-testid="item-detail"`) is the same shape
of context `PropertyRow` was built for — one item, full detail, room to spare. `ProjectsPage.tsx`'s
project cards are a dense grid (`line-clamp-2 text-xs` description under the project name,
already opinionated about staying compact); adding a `.tp-label` "Description" caption there
fights the density the card is deliberately designed around, for a description that's already
unambiguous without a label in that context. `ProjectPage.tsx` — the third site the issue named —
doesn't render `project.description` anywhere today; there's nothing there to convert. Recorded
here rather than silently dropped, so a future pass doesn't re-raise the same question without
this context.

**The "newer version exists" hint stays a separate line, not folded into the `PropertyRow` value.**
`RunPage.tsx`'s existing text was one sentence — "Pinned at v{n} — a newer version of this case
exists." Splitting it into `PropertyRow(label="Pinned version", value="v{n}")` plus a conditional
second line preserves the existing `RunPage.test.tsx` assertion (`findByText(/newer version/i)`,
matches any single element containing that phrase) without editing the test, and reads better:
"pinned version" is a property of the item, "a newer version exists" is a transient status hint
about it, not itself a value worth labeling.

**`StatusPill` vs. `Badge` vs. `PropertyRow`:**
- `StatusPill` (`HealthBar.tsx`): a *derived* health band computed from data (pass-rate
  thresholds → Healthy/In progress/At risk/No runs yet). Used where the underlying number
  needs a human-readable band, not the number itself.
- `Badge`: a small, fixed enum the user sets *directly* — today, only case priority. Reserved
  for values a user scans for at a glance across a list of items (existing `PropertyRow`
  rule, unchanged).
- `PropertyRow`: everything else — any scalar property that isn't a derived status band and
  isn't priority.

The dividing line between `StatusPill` and `Badge` is "computed vs. set": a `StatusPill`'s
label wouldn't make sense as something a user picks from a dropdown (you can't "set" a
project to Healthy), while a `Badge`'s value is exactly what the user chose.

## Risks / Trade-offs

[Leaving two of the issue's three named candidate sites unconverted could read as incomplete
follow-through] → the reasoning is recorded here and in the proposal, not silently dropped —
a future reviewer can disagree with the judgment call, but won't have to re-derive it from
scratch.
