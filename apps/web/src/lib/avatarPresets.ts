// Preset avatar gallery (add-user-profile) — keys must stay in sync with
// the backend allowlist, domain.AvatarPresetKeys (apps/api/internal/domain/domain.go).
// Images live in src/assets/avatars/, sourced from Wikimedia Commons —
// see assets/avatars/ATTRIBUTION.md (repo root) for license/attribution
// per image.
import adaLovelace from '@/assets/avatars/ada-lovelace.jpg'
import alanTuring from '@/assets/avatars/alan-turing.jpg'
import graceHopper from '@/assets/avatars/grace-hopper.jpg'
import marieCurie from '@/assets/avatars/marie-curie.jpg'
import charlesDarwin from '@/assets/avatars/charles-darwin.jpg'
import katherineJohnson from '@/assets/avatars/katherine-johnson.jpg'
import isaacNewton from '@/assets/avatars/isaac-newton.jpg'
import albertEinstein from '@/assets/avatars/albert-einstein.jpg'
import nikolaTesla from '@/assets/avatars/nikola-tesla.jpg'
import maryAnning from '@/assets/avatars/mary-anning.jpg'
import johnVonNeumann from '@/assets/avatars/john-von-neumann.jpg'
import emmyNoether from '@/assets/avatars/emmy-noether.jpg'

export type AvatarPresetKey =
  | 'ada-lovelace'
  | 'alan-turing'
  | 'grace-hopper'
  | 'marie-curie'
  | 'charles-darwin'
  | 'katherine-johnson'
  | 'isaac-newton'
  | 'albert-einstein'
  | 'nikola-tesla'
  | 'mary-anning'
  | 'john-von-neumann'
  | 'emmy-noether'

export const AVATAR_PRESETS: { key: AvatarPresetKey; name: string; image: string }[] = [
  { key: 'ada-lovelace', name: 'Ada Lovelace', image: adaLovelace },
  { key: 'alan-turing', name: 'Alan Turing', image: alanTuring },
  { key: 'grace-hopper', name: 'Grace Hopper', image: graceHopper },
  { key: 'marie-curie', name: 'Marie Curie', image: marieCurie },
  { key: 'charles-darwin', name: 'Charles Darwin', image: charlesDarwin },
  { key: 'katherine-johnson', name: 'Katherine Johnson', image: katherineJohnson },
  { key: 'isaac-newton', name: 'Isaac Newton', image: isaacNewton },
  { key: 'albert-einstein', name: 'Albert Einstein', image: albertEinstein },
  { key: 'nikola-tesla', name: 'Nikola Tesla', image: nikolaTesla },
  { key: 'mary-anning', name: 'Mary Anning', image: maryAnning },
  { key: 'john-von-neumann', name: 'John von Neumann', image: johnVonNeumann },
  { key: 'emmy-noether', name: 'Emmy Noether', image: emmyNoether },
]

const AVATAR_PRESET_MAP: Record<string, string> = Object.fromEntries(
  AVATAR_PRESETS.map((p) => [p.key, p.image]),
)

export function avatarPresetImage(key: string | null | undefined): string | undefined {
  return key ? AVATAR_PRESET_MAP[key] : undefined
}
