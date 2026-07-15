## Context

Revisits `redesign-ui` design D2 ("no new display typeface — personality
from weight/tracking on Geist alone"). That was a deliberate call at the
time; this change reopens it at the user's explicit request, with a
concrete reason (the plain-Geist wordmark reads flat next to the brand's
own two-tone logo file) rather than novelty for its own sake.

Design work happened live: three rounds of an interactive mockup
(Artifact) comparing real self-hosted font candidates — pulled the actual
`.woff2` files from their npm packages (same self-hosting pattern already
used for Geist, no Google Fonts CDN) rather than approximating with
system fonts, since a typeface decision needs to be judged on the real
glyphs.

## Decisions

**Recursive over IBM Plex Mono/Sans.** Both candidates were built and
compared. Recursive is one variable family with `MONO` and `CASL` axes;
"Test" renders at `MONO 1` (square, engineered) and "Pulse" at `CASL 1`
(rounder, alive) — one typeface embodying both halves of what the
product's name means. Plex would have paired two separate families
(Mono + Sans) — safer, more conventional, but less distinctive. Chosen:
Recursive.

**Weight: 520 (Test) / 470 (Pulse), not the first pass's 800/750.**
Compared at both hero size and actual header size (~17px). At heavy
weight the `MONO` axis's uniform stroke width fights the letterforms and
reads noisy rather than precise. At real header size 520/470 stays fully
legible and sits calmer next to the rest of the (mostly muted) header
chrome — the goal was "considered," not "loud."

**Icon: reuse `assets/brand/testpulse-icon.svg` geometry verbatim, don't
invent a new pulse motif.** The user asked whether there's a
pulse-monitor-related mark we could use; there already is one, sitting
unused — the icon tile's white stroke path IS an EKG line. Recolored via
the same CSS custom properties the rest of the header already uses (so it
tracks light/dark theme automatically), not hardcoded hex, since the
gradient's two stops are already `--primary`/a darker teal.

**Self-hosted, not a CDN.** `@fontsource-variable/recursive` (SIL OFL)
installed as a real dependency, imported in `index.css` next to the
existing Geist imports — same pattern, no new runtime dependency class,
no external font request.

## Risks / Trade-offs

- Recursive's full variable file is ~300KB (self-hosted, one-time
  cached load) — larger than Geist's per-weight subset files, but still
  a single request, not blocking initial paint of anything but the
  header text itself (`font-display: swap` degrades to the system
  fallback until it loads).
- Revisits a previously "settled" decision (D2) — documented here rather
  than silently overwritten, so the history stays legible.

## Open Questions

None outstanding — direction confirmed live against interactive mockups
before implementation.
