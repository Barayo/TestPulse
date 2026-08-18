import { avatarStyle, initialsFor } from '@/lib/avatar'
import { avatarPresetImage } from '@/lib/avatarPresets'

// Single rendering path for a person's identity everywhere it appears
// (add-user-profile, extended by add-custom-avatar-upload) — a chosen
// preset image if avatarKey resolves to a known preset, an uploaded photo
// (fetched from the avatar endpoint) if avatarKey is the reserved "custom"
// sentinel and a userId was supplied, otherwise the same generated
// initial-on-color chip PeoplePage/ProjectMembersPage/run-item assignees
// already used before this component existed. className controls size and
// shape (e.g. "size-6 rounded-full") — callers vary both across the app.
export function Avatar({
  seed,
  avatarKey,
  userId,
  className,
}: {
  seed: string
  avatarKey?: string | null
  userId?: string
  className?: string
}) {
  if (avatarKey === 'custom' && userId) {
    return (
      <img
        src={`/api/v1/users/${userId}/avatar`}
        alt={seed}
        className={`shrink-0 object-cover ${className ?? ''}`}
      />
    )
  }
  const image = avatarPresetImage(avatarKey)
  if (image) {
    // Preset images are a fixed Teal duotone baked into the JPG pixels
    // (assets/avatars/ATTRIBUTION.md) — retinted live via the same
    // instance-wide hue-rotate the rest of the palette system already
    // computes (add-color-theme-customization follow-up, Pepe design
    // review), so they don't clash on a non-Teal palette. Defaults to a
    // no-op on Teal itself. Never applied to an uploaded custom photo —
    // see the branch above, which returns before reaching this one.
    return (
      <img
        src={image}
        alt={seed}
        className={`shrink-0 object-cover ${className ?? ''}`}
        style={{ filter: 'var(--avatar-photo-filter, none)' }}
      />
    )
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center font-bold ${className ?? ''}`}
      style={avatarStyle(seed)}
    >
      {initialsFor(seed)}
    </span>
  )
}
