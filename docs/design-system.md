# Design system

A short reference for patterns introduced while redesigning test case detail
(`redesign-case-detail-page`) that future entity-detail pages should follow, rather than
re-deciding from scratch. It documents what exists in the codebase today, not an aspirational
style guide — extend it in the same change that introduces a new pattern.

## Property rows: `Label: value`

Every scalar property on an entity (a case's test type, automation, platform, tags, version,
suite membership; a run's pinned version; a project's description) renders through
`PropertyRow` (`apps/web/src/components/PropertyRow.tsx`): a label on the left, styled with the
`.tp-label` utility (mono, uppercase, tracked, muted), and the value on the right in normal
weight. An empty value shows a dash placeholder (`—`), never a blank space.

```tsx
<PropertyRow label="Test type" value={testCase.content.testType} />
<PropertyRow label="Priority" value={<Badge>{testCase.content.priority}</Badge>} />
```

**Rule**: badge or plain text? A badge is reserved for a value a user scans for at a glance
across a list of items — right now, that's priority only. Everything else — platform, test
type, tags, counts, version numbers — is a `PropertyRow` value. If you're reaching for a badge
and the value isn't one of a small, fixed set of states, use a property row instead.

## Numbered sequences (steps, and anything else ordered)

A numbered list item (`CaseDetailPage.tsx`'s Steps) is a semantic `<ol>`/`<li>`, not a `<div>`
list with a hand-typed "1." prefix — assistive tech gets step-count announcements for free that
way. Each item's index renders as a small circular badge, tinted with the brand color
(`bg-primary/10 text-primary`), not flat gray — it should read as *this app's* numbering, tying
back to the same teal used for the priority badge and the "current" version pill, not a generic
list marker that could belong to any product. A live visual review turned up the flat-gray
version and called it out specifically: legible, but generic — swapping the tint in was a small
change with an outsized effect on whether the page feels designed rather than defaulted.

A brand-gradient version of this badge (and a matching top accent bar on the Steps card) was
tried and reverted — it read as too strong against the app's otherwise soft, low-saturation
palette. The flat `bg-primary/10` tint above is the settled choice; don't reintroduce the
gradient here without a fresh design conversation first.

Any inline micro-label next to ordered content (Steps' "Expected:") uses `.tp-label` (mono,
uppercase, tracked) — the same treatment `PropertyRow` and panel titles already use — never a
plain bold word. A bold "Expected:" is legible on its own, but it invents a second label
vocabulary next to a page that already has one; reusing `.tp-label` is what makes disparate
sections (a numbered list, a property sidebar, a section heading) read as one system instead of
several components that happen to share a page.

**Don't reach for `text-muted-foreground` + a smaller size as the default way to mark something
"secondary."** Steps' expected-result line originally paired `text-sm` with `text-muted-foreground`
— smaller *and* lower-contrast than the action above it, even though "what should happen" is
arguably as important as "what to do," not lesser. A live review called this out directly.
Fixed: expected-result text is the same `text-base` size and full `text-foreground` contrast as
the action — readability and visual distinction are different problems, and shrinking/graying
text solves neither.

**Settled treatment: a soft tinted callout, not a border, not a font change, not the red/green
verdict colors.** Three restrained options were built live and compared directly on a real case
before deciding: a thin `border-l-2` accent, `font-mono` on the expected-result value, and italic
styling. The chosen one — `rounded-lg border-primary/20 bg-primary/5 p-2.5` wrapping the whole
expected-result line, plus the teal `.tp-label` — reuses the exact tint/border combination
`ProjectsPage.tsx`'s favorite-project card already uses, rather than inventing a new one, and
gives real visual presence without the earlier gradient attempt's "too strong" problem (that one
used solid/saturated fills; this uses the same `/5`–`/20` opacity tokens already proven
acceptable elsewhere in the app). Never reach for the red/green verdict colors here —
expected-result is descriptive, not itself a verdict, and `--destructive`/`--chart-1` would
misleadingly imply pass/fail.

## Sticky sidebar for long primary content

The sidebar (`md:sticky md:top-6 md:self-start`) stays pinned in the viewport as the user
scrolls through a long primary-content column — found by stress-testing the case detail page
across 0/1/3/10-step cases: at 10 steps, the content column outgrows the viewport, and without
`sticky` the shorter sidebar scrolls out of view entirely, making Properties/Results
inaccessible while reading later steps. `md:self-start` is required alongside `md:sticky` — a
grid item stretches to the row's full height by default, and a stretched element can't
stick meaningfully (there's nothing to scroll past within its own box). Reach for this whenever
a content+sidebar layout's primary content can grow past a typical viewport height; it isn't
needed for sidebars that are reliably taller than their content column (case detail's sidebar
usually is, but not once a case has many steps).

## Sidebar sections: one component, two renderings

`CaseSidebarSection` (`apps/web/src/components/CaseSidebarSection.tsx`) takes a `title` and
`children`. At `≥768px` it renders them in an always-visible block; below that it wraps the
same children in a native `<details>`/`<summary>`, closed by default. The breakpoint decision
comes from `useMediaQuery` (`apps/web/src/lib/useMediaQuery.ts`), a small hook wrapping
`window.matchMedia` — distinct from `useIsMobile` (`640px`, used for `ProjectsPage`'s card-grid
density, a different concern).

**Rule**: never build a second, parallel mobile-only render path for the same content. If a
section needs to collapse on narrow viewports, wrap it in `CaseSidebarSection` (or extend it)
rather than branching the JSX by viewport size at the call site.

## Chart colors

`--chart-1` through `--chart-5` (`apps/web/src/index.css`) are the only chart colors. Pass =
primary teal (`--chart-1`), fail = destructive red (`--chart-3`), skip/pending = secondary
yellow (`--chart-2`) — matching the semantic mapping the CSS already documents. Never introduce
a new hue for a chart; if the existing five don't cover a new series, that's a design
conversation, not a one-off color pick.

## Empty states

A section with no data yet still renders its full chrome — label, any placeholder shape, and
one line explaining why it's empty — never omitted outright. Two shapes, depending on how much
visual weight the section carries:

**Secondary/sidebar sections** (small, sit next to other content) — a single muted line is
enough. `CaseResultsPanel` (`apps/web/src/components/CaseResultsPanel.tsx`) is the reference:
static placeholder bars plus "No result history yet — record a run to see success rate here."
Matches the existing "No runs yet." convention elsewhere in the app. The same component also
has a tested, real populated-state renderer (an optional `data` prop) — built to review the
chart before real data existed to feed it, not yet called with real data anywhere.
`add-case-result-history` should extend this renderer rather than write a new one: uniform-height
status bars (verdict is discrete, not a magnitude — don't vary bar height by anything), reusing
`--chart-1/2/3`, with a legend + tooltip + text breakdown so identity is never color-alone.

**Primary content** (the main column of a page — the thing the page exists to show) — a bare
one-liner reads as broken, not intentional, once it's sitting next to a full-height sidebar
with real content (found via review of the shipped case-detail page: an empty Steps column next
to a populated Properties/Results/Version-history sidebar left a large, unexplained void).
These get the same dashed-border card `ProjectsPage.tsx` already uses for "No projects yet":
a muted icon, a short heading, one line of explanation, and — if there's an action that would
fix it — a primary button that starts that action directly (`CaseDetailPage.tsx`'s "No steps
yet" / "+ Add steps", which opens the same edit mode the page's Edit button does). Never leave
a page's main content area holding only a gray sentence.

**The same problem exists once a primary-content section has a little data, not just none** —
a live visual check turned up a case with a single step still showing a huge void beneath it,
because a short step list has no boundary of its own next to a sidebar that's naturally tall
(properties + results + version history). Primary content always renders inside a bounded
container (the shared `Card` component) once it has anything to show, exactly like the empty
state already does.

**Bounding the content alone isn't enough when the columns' heights differ a lot** — a small
card sitting at the top of an otherwise-empty stretched grid cell still looks unbalanced; the
void is still there, just with a small anchor at the top of it. The columns need a boundary
that tells the eye "these are two independent panes, they don't have to match" — the same
signal a file browser, a settings page, or any two-pane split view relies on.

**A 1px border is the wrong tool for that boundary in this palette.** A hairline divider was
tried first (`border-l`) and turned out functionally invisible: this app's tokens are all soft,
close-value near-whites (`--border` sits only a few RGB units from `--background`), so a 1px
line anti-aliases away on real displays — confirmed both by a live screenshot from an actual
browser and, separately, by inspecting a headless instance where the same rule computed to a
sub-pixel `0.56px` border width under a `1.8` device-pixel ratio. A single hairline is too thin
a signal to survive either problem. The fix that actually reads: give the sidebar a **filled
panel background**, not a line (`CaseDetailPage.tsx`'s sidebar wrapper:
`md:rounded-2xl md:bg-muted/60 md:p-5`) — a bounded, tinted area is far more perceptible than a
line at any contrast level, and it can't disappear to sub-pixel rendering the way a border can.
Prefer filled panels over hairline dividers for structural boundaries in this design system;
reserve borders for internal separators within an already-bounded container (e.g. the divider
between Properties and Results inside the sidebar panel itself).

## Destructive-action confirmation

Not introduced by this change, but the canonical pattern to reuse for any future delete
action: a `Dialog` that names exactly what will be affected and states irreversibility in plain
language, gated behind an explicit confirm click — never a bare click-to-delete. See
`RolesPage.tsx` ("Delete role", "Reset to defaults") and `PeoplePage.tsx` ("Deactivate",
"Remove member") for the established shape.

## Icons

`lucide-react` exclusively for UI icons — no emoji. (`FolderExplorerPage.tsx`'s emoji
folder/case icons predate this and are a known inconsistency, tracked separately.)

## Breadcrumbs: the last segment truncates, earlier ones never wrap

`Breadcrumbs.tsx`'s flex row gives every non-last segment `shrink-0 whitespace-nowrap` and the
last (current-page) segment `min-w-0 flex-1 truncate`. This isn't decorative — a plain
`flex items-center` row with no shrink/wrap handling breaks badly on mobile: flex items default
to a `min-width` equal to their own min-content size, and when a long final segment (e.g. a
case title) can't fit, the browser doesn't just overflow the row — it shrinks the segment below
its natural width and starts wrapping individual words, producing a vertical column of text
clipped at the screen edge (found via a real mobile screenshot). Any future multi-segment,
variable-length trail (breadcrumbs, tabs, chip rows) needs this same treatment: fixed segments
don't shrink or wrap, the one variable-length segment takes remaining space and truncates.

## Multiline text fields for anything that can run long

`StepEditor.tsx`'s Action and Expected result fields are `Textarea` (`field-sizing: content`,
auto-grows with input), not `Input`. A single-line input silently scrolls/clips content longer
than its width — fine for a title, actively hard to edit for a sentence-length action or
expected result (found via live review: the edit form's fields were unreadably clipped for any
step with real content, e.g. full HTTP-call descriptions). Reach for `Textarea` over `Input`
for any field whose realistic content can exceed a short label or single short phrase.

## What this document doesn't cover yet

It has no enforcement mechanism (no lint rule stops a future page from reaching for a bare
`Badge`) and it doesn't yet cover every page in the app — it's seeded from the case-detail
redesign and a full-app UX audit, not a retrofit of every existing screen. Extend it as new
patterns are established, and note here when an existing page still needs to catch up.
