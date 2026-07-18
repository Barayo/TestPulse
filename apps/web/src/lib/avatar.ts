import type { CSSProperties } from 'react'

// Identity carries color instead of a row background having to (redesign
// prompted by "too much green" once Roles/Users/Teams all filled their row
// backgrounds solid). A person/team is assigned one of six muted hues
// deterministically by name, and the hue lives in a small avatar chip, not
// a full-width fill — see --avatar-N-bg/fg in index.css. Shared between
// PeoplePage and ProjectMembersPage so the same identity reads the same
// color everywhere it appears.
const AVATAR_HUE_COUNT = 6

export function avatarStyle(seed: string): CSSProperties {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const n = (hash % AVATAR_HUE_COUNT) + 1
  return { backgroundColor: `var(--avatar-${n}-bg)`, color: `var(--avatar-${n}-fg)` }
}

export function initialsFor(seed: string): string {
  const name = seed.includes('@') ? seed.split('@')[0] : seed
  return (name[0] ?? '?').toUpperCase()
}
