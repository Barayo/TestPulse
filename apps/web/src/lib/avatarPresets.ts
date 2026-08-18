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
import severoOchoa from '@/assets/avatars/severo-ochoa.jpg'
import richardFeynman from '@/assets/avatars/richard-feynman.jpg'
import leonardoDaVinci from '@/assets/avatars/leonardo-da-vinci.jpg'
import archimedes from '@/assets/avatars/archimedes.jpg'
import charlesBabbage from '@/assets/avatars/charles-babbage.jpg'
import galileoGalilei from '@/assets/avatars/galileo-galilei.jpg'
import michaelFaraday from '@/assets/avatars/michael-faraday.jpg'
import srinivasaRamanujan from '@/assets/avatars/srinivasa-ramanujan.jpg'
import hideyoNoguchi from '@/assets/avatars/hideyo-noguchi.jpg'
import confucius from '@/assets/avatars/confucius.jpg'
import sophieGermain from '@/assets/avatars/sophie-germain.jpg'
import carolineHerschel from '@/assets/avatars/caroline-herschel.jpg'
import marySomerville from '@/assets/avatars/mary-somerville.jpg'
import henriettaSwanLeavitt from '@/assets/avatars/henrietta-swan-leavitt.jpg'
import nettieStevens from '@/assets/avatars/nettie-stevens.jpg'
import liseMeitner from '@/assets/avatars/lise-meitner.jpg'
import agnesPockels from '@/assets/avatars/agnes-pockels.jpg'
import hypatia from '@/assets/avatars/hypatia.jpg'

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
  | 'severo-ochoa'
  | 'richard-feynman'
  | 'leonardo-da-vinci'
  | 'archimedes'
  | 'charles-babbage'
  | 'galileo-galilei'
  | 'michael-faraday'
  | 'srinivasa-ramanujan'
  | 'hideyo-noguchi'
  | 'confucius'
  | 'sophie-germain'
  | 'caroline-herschel'
  | 'mary-somerville'
  | 'henrietta-swan-leavitt'
  | 'nettie-stevens'
  | 'lise-meitner'
  | 'agnes-pockels'
  | 'hypatia'

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
  { key: 'severo-ochoa', name: 'Severo Ochoa', image: severoOchoa },
  { key: 'richard-feynman', name: 'Richard Feynman', image: richardFeynman },
  { key: 'leonardo-da-vinci', name: 'Leonardo da Vinci', image: leonardoDaVinci },
  { key: 'archimedes', name: 'Archimedes', image: archimedes },
  { key: 'charles-babbage', name: 'Charles Babbage', image: charlesBabbage },
  { key: 'galileo-galilei', name: 'Galileo Galilei', image: galileoGalilei },
  { key: 'michael-faraday', name: 'Michael Faraday', image: michaelFaraday },
  { key: 'srinivasa-ramanujan', name: 'Srinivasa Ramanujan', image: srinivasaRamanujan },
  { key: 'hideyo-noguchi', name: 'Hideyo Noguchi', image: hideyoNoguchi },
  { key: 'confucius', name: 'Confucius', image: confucius },
  { key: 'sophie-germain', name: 'Sophie Germain', image: sophieGermain },
  { key: 'caroline-herschel', name: 'Caroline Herschel', image: carolineHerschel },
  { key: 'mary-somerville', name: 'Mary Somerville', image: marySomerville },
  { key: 'henrietta-swan-leavitt', name: 'Henrietta Swan Leavitt', image: henriettaSwanLeavitt },
  { key: 'nettie-stevens', name: 'Nettie Stevens', image: nettieStevens },
  { key: 'lise-meitner', name: 'Lise Meitner', image: liseMeitner },
  { key: 'agnes-pockels', name: 'Agnes Pockels', image: agnesPockels },
  { key: 'hypatia', name: 'Hypatia', image: hypatia },
]

const AVATAR_PRESET_MAP: Record<string, string> = Object.fromEntries(
  AVATAR_PRESETS.map((p) => [p.key, p.image]),
)

export function avatarPresetImage(key: string | null | undefined): string | undefined {
  return key ? AVATAR_PRESET_MAP[key] : undefined
}
