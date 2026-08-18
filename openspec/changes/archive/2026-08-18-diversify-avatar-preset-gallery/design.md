## Context

`apps/web/src/lib/avatarPresets.ts` holds 22 preset avatars (women scientists/
mathematicians alongside men): 6 women, 16 men. Each preset is a 128×128 web copy (plus a
512×512 master in `assets/avatars/`) of a public-domain or clearly-licensed Wikimedia
Commons image, individually chosen, square-cropped, and put through a fixed processing
pipeline documented in `assets/avatars/ATTRIBUTION.md`: grayscale → contrast-normalize →
35% blend with a teal duotone (`#0B2E2C` shadows → `#14B8A6` highlights). `Avatar.tsx`
additionally applies a CSS `hue-rotate()` filter at render time (per
`add-color-theme-customization`) so the fixed teal bake retints to match the instance's
active color palette.

`ATTRIBUTION.md` already documents two earlier attempts at adding women to this exact
roster that failed for concrete, non-obvious reasons — both must be treated as settled,
not re-attempted without new information:
- **Rosalind Franklin** — rejected outright: her best-known photographs have
  unclear/disputed copyright status (the National Portrait Gallery manages licensing;
  ownership of the DNA photograph specifically is undocumented).
- **Barbara McClintock** — added, then removed 2026-08-04 after a full search of her
  Commons category (21 files) found nothing usable: two well-known lab portraits have a
  striped-wall background with visible shadow/crop marks, a 1910s family photo has
  another person's shoulder in frame, a Nobel-lecture photo is too small/distant to crop,
  and one seemingly-promising file turned out to depict an unrelated living person who
  shares her name.

This history is why this change's actual deliverable is a **sourcing brief with named
candidates**, not just "go find 9 women" — the project has already burned time on two
candidates that looked obviously right and weren't.

## Goals / Non-Goals

**Goals:**
- Name and verify specific women scientists/mathematicians to source portraits for,
  spanning the same eras/fields the existing 22 already cover, avoiding names already
  known to be problematic.
- Source, crop, and process each verified candidate's real Commons photo through the
  existing pipeline, and wire the results into `avatarPresets.ts`, the backend
  allowlist, and `ATTRIBUTION.md`.
- Leave every existing preset untouched.

**Non-Goals:**
- Generating new, non-existent portrait art (e.g. AI image generation). Every image in
  this change is a real historical photograph/painting/engraving already hosted on
  Wikimedia Commons — downloaded and processed, not invented. (This change's early
  drafts wrongly assumed no image work was possible in this session at all, conflating
  that unavailable AI-generation capability with the actually-available "download and
  deterministically transform an existing file" capability — corrected once checked.)
- Changing `Avatar.tsx`'s rendering/retinting pipeline — new images fit the existing
  pipeline unchanged.
- Broadening beyond the existing scientist/mathematician theme (decided during
  brainstorming — stays consistent with the current 22).

## Decisions

**1. Eight verified candidates, after two rounds of hands-on Commons research (not just
named — actually checked).** The original 9 named candidates were verified image-by-image
(downloaded, viewed, test-cropped — not filename-matched) by a dedicated research pass.
Results:

| # | Name | Field | Era | Status |
|---|---|---|---|---|
| 1 | Hypatia | Mathematics/astronomy | Antiquity (c. 350–415) | ✅ Confirmed |
| 2 | Sophie Germain | Mathematics | 18th–19th c. | ✅ Confirmed |
| 3 | Caroline Herschel | Astronomy | 18th–19th c. | ✅ Confirmed |
| 4 | Mary Somerville | Mathematics/science writing | 19th c. | ✅ Confirmed |
| 5 | Henrietta Swan Leavitt | Astronomy | Turn of 20th c. | ✅ Confirmed |
| 6 | Nettie Stevens | Genetics | Early 20th c. | ✅ Confirmed |
| 7 | Lise Meitner | Physics | 20th c. | ✅ Confirmed |
| 8 | ~~Dorothy Hodgkin~~ → **Agnes Pockels** | Chemistry | 19th–20th c. | ✅ Confirmed (replacement) |
| — | ~~Chien-Shiung Wu~~ | Physics | 20th c. | ❌ No replacement found |

**Dorothy Hodgkin — rejected, same outcome as McClintock.** All 36 files in her Commons
category checked: every real photograph has a busy background (wood-paneled door with
visible handle), shows other people, or is a medal/insignia close-up rather than a
person. The sole clean-background alternative is a 2021 digital illustration by a living
artist — stylistically inconsistent with the roster's period-photo/painting/engraving
convention, the same reason a similar Leavitt illustration was passed over in favor of
her real 1898 photograph. Replaced with **Agnes Pockels** (physical chemistry,
1862–1935): a painted three-quarter portrait, c. 1892, plain painted studio backdrop,
public domain, no attribution required — verified clean on the first candidate tried.

**Chien-Shiung Wu and two further physics candidates — all rejected, slot left open.**
Wu's one excellent 1930s student portrait has unresolved US public-domain status (China-PD
tag only, no confirmed US tag, vague date) — the same class of problem that sank Rosalind
Franklin, not worth the exposure. Two follow-up candidates in the same field were tried
and also rejected: **Marietta Blau** has no photograph on Commons at all (only modern
illustrations and a plaque photo); **Katharine Burr Blodgett**'s only photo is a 1938 GE
publicity shot buried in lab clutter (bottles, cabinets, apparatus flanking her on both
sides); **Cecilia Payne-Gaposchkin** has 15 files in her category, 8 of them actual
photographs, and every one is either a busy background (stone building wall, file-cabinet
office, home interior with a china cabinet) or a modern photographer's stylistically-
inconsistent portrait. Per user decision: **ship without a physics-slot replacement**
rather than force a 9th name through or spend a third research round chasing
diminishing returns — the same call the project already made once for McClintock.

**Final roster: 8 new presets, 30 total, 14 women / 16 men.**

**2. Image requirements, matching the existing pipeline exactly (no new pipeline
decisions):**
- Source: Wikimedia Commons only, matching every existing preset.
- Background: plain, light, or otherwise uncluttered natively — per `ATTRIBUTION.md`'s
  established rule, no background editing/removal is done, so a source with a busy
  background is a hard skip in favor of a different portrait of the same person (as the
  existing roster's 2026-08-04 re-sourcing pass repeatedly did) rather than attempting one
  more time to fix it with editing.
- License: PD-old/CC-PD-Mark preferred; a CC-BY institutional source (like the existing
  `leonardo-da-vinci`/`charles-babbage` Wellcome Collection engravings) is acceptable but
  should be flagged the same way — those two already carry an unresolved in-app
  attribution-credit debt this change should not silently grow further without a plan.
- Crop: square, centered on head/shoulders, manually chosen per image — same as every
  existing preset (512×512 master, 128×128 web copy).
- Processing: grayscale → contrast-normalize → 35% teal duotone blend, run through
  whatever tool produced the existing 22 (not specified in this repo as a checked-in
  script — verify whether one exists before reinventing the pipeline by hand).

**3. Verified sourcing table — ready to execute, no further research needed.**

| Key | Subject/description | Commons URL | License | Attribution required? |
|---|---|---|---|---|
| `hypatia` | Hypatia, wood engraving, mid-19th century (imagined likeness — no contemporary depiction exists, same caveat as `archimedes`/`leonardo-da-vinci`) | [Commons](https://commons.wikimedia.org/wiki/File:Hypatia_-_mid_19th_century_engraving.jpg) | CC-PD-Mark | No |
| `sophie-germain` | Sophie Germain, engraved bust portrait, from *Œuvres philosophiques*, 1896 | [Commons](https://commons.wikimedia.org/wiki/File:Germain_-_Œuvres_philosophiques,_1896_(Illustration_page_4).jpg) | CC-PD-Mark / PD-old | No |
| `caroline-herschel` | Caroline Herschel, aged 92, stipple engraving by Joseph Brown, frontispiece to her 1876 memoir | [Commons](https://commons.wikimedia.org/wiki/File:Caroline_Herschel-1876-Memoir-frontispiece.jpeg) | PD-old-100 / CC-PD-Mark | No |
| `mary-somerville` | Mary Somerville, wood engraving, *Illustrated London News*, 1872, Library of Congress | [Commons](https://commons.wikimedia.org/wiki/File:Mary_Fairfax_Somerville,_1780-1872,_bust_portrait,_facing_left_LCCN2005691459.jpg) | CC-PD-Mark / PD-old | No |
| `henrietta-swan-leavitt` | Henrietta Swan Leavitt, studio photograph, c. 1898, Library of Congress | [Commons](https://commons.wikimedia.org/wiki/File:Henrietta_Swan_Leavitt.jpg) | Public domain (pre-1931 publication) | No |
| `nettie-stevens` | Nettie Stevens, studio portrait, c. 1904, Bryn Mawr College Archives (Adam Cuerden restoration; Commons featured picture) | [Commons](https://commons.wikimedia.org/wiki/File:Nettie_Maria_Stevens_(cropped).jpg) | PD-1923 | No |
| `lise-meitner` | Lise Meitner, 1953, USIS photo, Austrian National Library holding | [Commons](https://commons.wikimedia.org/wiki/File:Lise_Meitner_(1878–1968)_1953_OeNB_USIS_2955727.jpg) | Public domain (US federal government work) | No |
| `agnes-pockels` | Agnes Pockels, painted portrait, artist unknown, c. 1892 | [Commons](https://commons.wikimedia.org/wiki/File:Agnes_Pockels_ca1892.jpg) | Public domain (CC-PD-Mark, PD-old, anonymous author) | No |

Two notes carried over from verification, matching existing tolerances elsewhere in
`ATTRIBUTION.md`: the Hypatia engraving is a full scene (globe, book, tree) needing a
careful crop to isolate the plain hatched background beside her head, the same treatment
`mary-anning` already got; Leavitt's backdrop is a mottled studio cloth rather than a
flat tone, comparable to `marie-curie`/`emmy-noether`'s existing photographic backdrops.
`agnes-pockels`'s Commons file carries a "PD-old missing SDC copyright status"
maintenance flag (no explicit US-specific PD tag attached) — the same class of gap
several already-shipped presets carry (e.g. `ada-lovelace`, `nikola-tesla`), not a
blocker under the standard already applied to this roster.

## Risks / Trade-offs

- **[Risk]** The physics slot ships empty — 14/30 rather than the originally-targeted
  15/31. → **Mitigation:** accepted deliberately after two research rounds (5 physics/
  chemistry names tried total) found no clean candidate; the spec's regression-guard
  floor (see specs delta) is set to the achieved 14/30, not the aspirational 15/31, so it
  reflects a real, verified commitment rather than an unmet target. Revisit if a future
  Commons upload changes the picture (same as the standing McClintock note already does).
- **[Risk]** Wikimedia rate-limited (HTTP 429) repeated downloads of the same file
  (Hypatia's source, hit heavily during the earlier research pass) even after backing
  off with delays. → **Mitigation:** the pre-generated cached thumbnail path
  (`/thumb/.../<width>px-<file>.jpg`) wasn't subject to the same limit as
  `Special:FilePath` and the unscaled-original URL — used that instead, successfully.
- **[Risk]** Adding 8 more attribution rows to `ATTRIBUTION.md` doesn't add any new CC-BY
  attribution-credit debt (all 8 verified sources are attribution-free), so this change
  doesn't compound the existing unresolved Los Alamos/Wellcome credit-line gap — noted
  here so a future reader doesn't have to re-derive it from the sourcing table.

## Migration Plan

No migration — purely additive presets, no existing data changes. Shipped in one pass:
8 image file pairs produced (downloaded from Commons, cropped, processed through the
existing pipeline), 8 `AvatarPresetKey` entries added, backend allowlist synced,
`ATTRIBUTION.md` extended (including prose entries for the 5 rejected candidates —
Hodgkin, Wu, Blau, Blodgett, Payne-Gaposchkin — matching how Franklin/McClintock are
already documented there).

## Open Questions

None outstanding — resolved during implementation: no repeatable processing script
existed in the repo (confirmed by search), so a one-off script was written for this
task's 8 images, matching how the original 22 were evidently produced by hand too.
