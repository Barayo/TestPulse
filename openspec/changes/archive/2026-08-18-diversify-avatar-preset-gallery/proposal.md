## Why

The preset avatar gallery (`apps/web/src/lib/avatarPresets.ts`) has 22 historical-figure
portraits, only 6 of them women — a skew that reads as an oversight rather than a
deliberate choice when a user browses the Profile page's avatar picker. Issue #125,
flagged directly by a user while reviewing an unrelated color-theme change.

## What Changes

- Add 8 new preset avatars — women scientists and mathematicians spanning the same
  historical eras and fields the existing 22 already cover (antiquity through the 20th
  century; math, chemistry, astronomy, genetics) — bringing the roster to 30 presets at
  14 women / 16 men. No existing preset is removed, renamed, or re-themed; every current
  user's chosen avatar is unaffected. Started as 9 candidates; verification (see
  design.md) confirmed 8 have a usable Commons source and found no viable physics-slot
  candidate after two research rounds (5 names tried) — shipping 8 rather than forcing a
  9th name through, matching how the existing roster already handled the same problem
  for Barbara McClintock.
- All 8 portraits were sourced, cropped, and processed through the existing teal-duotone
  pipeline in this session (downloading real Wikimedia Commons photos and running
  deterministic crop/tint transforms needed only internet access + Pillow, not an AI
  image-generation tool — an earlier assessment in this change's history conflated the
  two and wrongly called this blocked; corrected once the actual capability was
  checked). Images are wired into `avatarPresets.ts`, the backend allowlist, and
  `ATTRIBUTION.md` as part of this same change.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `authentication`: the "Self-service profile" requirement gains a testable floor —
  at least 14 women out of at least 30 total presets — as a regression guard against
  the roster drifting back toward the skew issue #125 flagged (the requirement's
  existing "selects one of the preset avatars" behavior is otherwise unchanged).

## Impact

- `apps/web/src/lib/avatarPresets.ts` — 8 new `AvatarPresetKey` entries + `AVATAR_PRESETS`
  rows.
- `apps/api/internal/domain/domain.go` — the backend `AvatarPresetKeys` allowlist kept
  in sync with the new keys (existing comment in `avatarPresets.ts` already documents this
  coupling).
- `assets/avatars/ATTRIBUTION.md` — 8 new per-image license/attribution entries, plus
  prose entries documenting the Hodgkin/Wu/Blau/Blodgett/Payne-Gaposchkin dead ends
  (matching how Franklin/McClintock/Levi-Montalcini are already documented).
- `assets/avatars/` (512×512 masters) and `apps/web/src/assets/avatars/` (128×128 web
  copies) — 8 new processed image files.
- No change to `Avatar.tsx`'s rendering/retinting pipeline — new images must be produced
  compatible with the existing teal-duotone + `hue-rotate()` filter approach, not require
  changes to it.
