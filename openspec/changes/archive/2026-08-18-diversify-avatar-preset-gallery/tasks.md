## 1. Verify sourcing (do this first — the step that would have caught past dead ends)

- [x] 1.1 For each of the 9 original candidates, confirmed a Wikimedia Commons image
      exists with a plain/light/uncluttered background natively, a real head/shoulders
      portrait, and a clear PD or CC license — 7 of 9 confirmed on the first pass
      (Hypatia, Sophie Germain, Caroline Herschel, Mary Somerville, Henrietta Swan
      Leavitt, Nettie Stevens, Lise Meitner); Dorothy Hodgkin and Chien-Shiung Wu did not
      clear verification (see design.md). Exact Commons URLs and license tags recorded in
      design.md's sourcing table.
- [x] 1.2 Dorothy Hodgkin's slot: replacement candidate **Agnes Pockels** verified clean
      on the first try (painted portrait, c. 1892, public domain). Chien-Shiung Wu's
      slot: two further replacement candidates (Marietta Blau, Katharine Burr Blodgett)
      plus a third (Cecilia Payne-Gaposchkin, 15-file category, 8 photos checked) were
      all tried and rejected — no viable physics-slot candidate found after two full
      research rounds (5 names total). Per user decision, shipping without a
      replacement — same call the project already made once for McClintock.
      `proposal.md`/`design.md`/the specs delta updated to reflect the final 8-name
      roster. Correction found during implementation: the pre-change roster is actually
      22 presets (6 women), not 21 as the GH issue text stated — final roster is 30
      total, 14 women, not 29/14 as first drafted; all artifacts corrected.
- [x] 1.3 No repeatable processing script for the grayscale/contrast/teal-duotone
      pipeline was found checked into this repo — `ATTRIBUTION.md` doesn't reference one,
      and no `scripts/` entry matches. Wrote a one-off Python (PIL) script for this task
      (crop → grayscale → autocontrast → `ImageOps.colorize` teal duotone → 35% blend →
      resize to 512/128) — not checked into the repo, matching how the original 22 were
      evidently produced by hand too.

## 2. Produce the assets

- [x] 2.1 Correction: an image-processing capability *was* available in this session
      (internet access via Bash + Pillow) — the earlier "blocked, no image-generation
      tool" assessment conflated AI image *generation* (genuinely unavailable) with
      downloading-and-processing *existing* real photos (which needed neither AI nor a
      dedicated tool). Downloaded all 8 verified Commons sources; Hypatia's file was
      persistently rate-limited (HTTP 429) via `Special:FilePath` and even the
      unscaled-original URL — resolved by fetching the pre-generated cached thumbnail
      path instead (`/thumb/.../500px-....jpg`), which wasn't rate-limited. Visually
      inspected every source image before cropping (via the Read tool's image support),
      picked a manual square crop per image, and processed each through the pipeline
      above. Hypatia's source is a full scene (globe, book, tree) — cropped tightly to
      isolate the plain background beside her head, same treatment `mary-anning` got.
      Compared output against `ada-lovelace.jpg` to confirm the duotone tone matches
      exactly.
- [x] 2.2 Saved 512×512 masters to `assets/avatars/<key>.jpg` and 128×128 web copies to
      `apps/web/src/assets/avatars/<key>.jpg` for all 8 keys.

## 3. Wire into the app

- [x] 3.1 Added `apps/web/src/lib/avatarPresets.test.ts` (new file): asserts all 8 new
      keys are present, asserts the roster meets the gender-balance floor (≥14 women of
      ≥30 total, via a test-local `WOMEN_KEYS` set — kept out of the production data
      structure since nothing at render time needs gender), and a resolves-to-an-image
      sanity check for every preset. RED confirmed before implementation (22/6, then
      29/13 after adding 7 presets, missing only Hypatia), GREEN after all 8 landed.
- [x] 3.2 Added the 8 new `AvatarPresetKey` union members, imports, and `AVATAR_PRESETS`
      entries to `avatarPresets.ts`.
- [x] 3.3 Added the matching 8 keys to the backend `AvatarPresetKeys` allowlist in
      `apps/api/internal/domain/domain.go` (gofmt-aligned). Confirmed existing test
      coverage for the unrecognized-key-rejected-server-side case
      (`identity_api_test.go:757`, `PATCH /api/v1/users/me` with a bogus `avatarKey` →
      400) — no extension needed, the allowlist swap is exercised by that existing test
      path. `go build ./...` and `go test ./internal/domain/... ./internal/service/...
      ./internal/server/...` all pass.
- [x] 3.4 Extended `assets/avatars/ATTRIBUTION.md`: header count (22→30), 8 new table
      rows, and a new prose paragraph documenting all 5 rejected candidates (Dorothy
      Hodgkin, Chien-Shiung Wu, Marietta Blau, Katharine Burr Blodgett, Cecilia
      Payne-Gaposchkin) with the specific reason each failed, in the same style as the
      existing Franklin/McClintock/Levi-Montalcini entries. Table now has exactly 30
      rows, matching the final roster.
- [x] 3.5 Confirmed none of the 8 new presets requires an in-app attribution credit (all
      PD/CC-PD-Mark) — the existing "Four images require an in-app attribution credit"
      note is unchanged, correctly still describing only the pre-existing 4.

## 4. Sample Project showcase

- [x] 4.1 Not applicable — this widens an existing preset roster (any user can already
      see the full picker via the Profile page); `seed.go` unchanged.

## 5. Documentation

- [x] 5.1 Confirmed no `docs/` page enumerates specific preset names/count — no doc
      change needed beyond `ATTRIBUTION.md` (3.4).

## 6. Final verification

- [x] 6.1 `apps/web`: `npx vitest run` — 92 files, 1148 tests, all pass. `npm run
      typecheck` clean. `npx oxlint` — 24 pre-existing warnings, none new. `npm run
      build` — succeeds, all 8 new images bundled (confirmed via `dist/assets/`
      listing), build artifact removed after checking. `apps/api`: `go build ./...` and
      the three affected package test suites all pass.
- [x] 6.2 Rebuilt and redeployed the local compose stack; verified in a real browser on
      the Profile page's avatar picker — confirmed via the accessibility tree that all
      30 presets are present (`ref_8`–`ref_37`, all 8 new names correctly labeled), and
      visually via zoomed screenshots that all 8 new images render with the correct
      teal duotone under the default theme, and correctly retint under Indigo
      (`hue-rotate()` filter applies uniformly across old and new presets, no pipeline
      changes needed). Reverted the instance back to Teal before finishing.
