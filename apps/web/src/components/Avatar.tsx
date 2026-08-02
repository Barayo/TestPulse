import { avatarStyle, initialsFor } from '@/lib/avatar'
import { avatarPresetImage } from '@/lib/avatarPresets'

// Single rendering path for a person's identity everywhere it appears
// (add-user-profile) — a chosen preset image if avatarKey resolves to a
// known preset, otherwise the same generated initial-on-color chip
// PeoplePage/ProjectMembersPage/run-item assignees already used before
// this component existed. className controls size and shape (e.g.
// "size-6 rounded-full") — callers vary both across the app.
export function Avatar({
  seed,
  avatarKey,
  className,
}: {
  seed: string
  avatarKey?: string | null
  className?: string
}) {
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
