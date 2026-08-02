import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/useAuth'
import { Avatar } from '@/components/Avatar'
import { AVATAR_PRESETS } from '@/lib/avatarPresets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/Breadcrumbs'

export default function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [timezone, setTimezone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!user) return
    setDisplayName(user.displayName ?? '')
    setAvatarKey(user.avatarKey ?? null)
    setTimezone(user.timezone ?? '')
  }, [user])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await api.PATCH('/api/v1/users/me', {
        body: { displayName: displayName || null, avatarKey, timezone: timezone || null },
      })
      await refreshUser()
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-2xl space-y-4">
      <Breadcrumbs segments={[{ label: 'Profile' }]} />
      <h1 className="tp-heading text-xl">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">Your details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar
                seed={displayName || user.email}
                avatarKey={avatarKey}
                className="size-12 rounded-full text-base"
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={user.email}
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Avatar</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar">
                <label className="flex flex-col items-center gap-1">
                  <input
                    type="radio"
                    name="avatar"
                    className="sr-only"
                    checked={avatarKey === null}
                    onChange={() => setAvatarKey(null)}
                    aria-label="Generated default"
                  />
                  <span
                    className={`flex size-10 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      avatarKey === null ? 'border-primary' : 'border-transparent'
                    }`}
                    style={{ background: 'var(--muted)' }}
                    aria-hidden="true"
                  >
                    {(displayName || user.email)[0]?.toUpperCase() ?? '?'}
                  </span>
                </label>
                {AVATAR_PRESETS.map((preset) => (
                  <label key={preset.key} className="flex flex-col items-center gap-1">
                    <input
                      type="radio"
                      name="avatar"
                      className="sr-only"
                      checked={avatarKey === preset.key}
                      onChange={() => setAvatarKey(preset.key)}
                      aria-label={preset.name}
                    />
                    <img
                      src={preset.image}
                      alt={preset.name}
                      className={`size-10 rounded-full border-2 object-cover ${
                        avatarKey === preset.key ? 'border-primary' : 'border-transparent'
                      }`}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Europe/Madrid"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              {saved && <span className="text-sm text-muted-foreground">Saved</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link to="/settings/tokens" className="block text-sm text-primary hover:underline">
            API tokens
          </Link>
          {user.isTenantAdmin && (
            <Link to="/settings/users" className="block text-sm text-primary hover:underline">
              Manage users
            </Link>
          )}
          <Button type="button" variant="outline" size="sm" disabled title="Coming soon">
            Change password
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
