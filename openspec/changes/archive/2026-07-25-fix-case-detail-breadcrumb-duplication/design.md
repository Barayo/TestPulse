## Context

`Breadcrumbs.tsx:73-75` already suppresses a single-segment trail because
it would repeat the page's own heading. `CaseDetailPage.tsx` builds a
multi-segment trail whose last segment is `testCase.content.title`
(line 133), rendered again as the real `<h1>` (line 152) — the only page
in the app where a semantic heading is duplicated this way (every other
multi-segment page either has no `<h1>` at all, in which case the trailing
crumb legitimately is the page's identity, or duplicates only a short
generic label via a non-semantic `<div>`).

## Goals / Non-Goals

**Goals:**
- Case-detail's trail ends at the parent folder; the title lives only in
  the `<h1>`.

**Non-Goals:**
- No change to `Breadcrumbs.tsx` itself — it already does the right thing
  with whatever segments it's given.
- No change to `RunPage.tsx`'s smaller, lower-priority instance of the
  same pattern (a `<div>` `CardTitle`, not a real `<h1>`, and run names are
  short) — explicitly deferred.
- No new visual pattern (e.g. showing the case key instead of the title)
  — dropping the redundant crumb is sufficient and matches how the rest of
  the app already handles this.

## Decisions

- **Drop the case-title segment at the call site in `CaseDetailPage.tsx`**,
  not by adding new logic to the shared `Breadcrumbs` component. The
  component already renders whatever segment array it receives correctly;
  the bug is that this one caller includes a segment it shouldn't.

## Risks / Trade-offs

- [Risk] Without the trailing segment, a case-detail page reached directly
  (e.g. via a bookmarked/shared URL) shows one fewer visual cue that "this
  is a case" in the trail itself → Mitigation: the `<h1>` and the page's
  own content (steps, properties) make this unambiguous immediately; no
  other page in the app relies on the breadcrumb alone for this either.
