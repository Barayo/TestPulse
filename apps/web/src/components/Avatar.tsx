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
    return <img src={image} alt={seed} className={`shrink-0 object-cover ${className ?? ''}`} />
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
