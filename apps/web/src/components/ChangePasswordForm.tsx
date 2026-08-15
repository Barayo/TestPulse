import { useState, type FormEvent } from 'react'
import { TriangleAlertIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'
import { GeneratedPasswordChip } from '@/components/GeneratedPasswordChip'
import { generateSecurePassword } from '@/lib/generatePassword'

// Shared self-service change-password logic (add-change-own-password) —
// used by ProfilePage's dialog (optional, own current password already
// works) and the required-password-change gate (mandatory, no cancel).
// Revokes every session on success, so onSuccess always means "go to
// /login," never "stay here."
export function ChangePasswordForm({
  onSuccess,
  onCancel,
  submitLabel = 'Change password',
}: {
  onSuccess: () => void
  onCancel?: () => void
  submitLabel?: string
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [revealedPassword, setRevealedPassword] = useState<string>()
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  function handleGeneratePassword() {
    const generated = generateSecurePassword()
    setNewPassword(generated)
    setRevealedPassword(generated)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    setSubmitting(true)
    try {
      const { error: apiError, response } = await api.POST('/api/v1/users/me/password', {
        body: { currentPassword, newPassword },
      })
      if (!response.ok) {
        setError((apiError as { error?: string })?.error ?? 'Could not change your password.')
        return
      }
      onSuccess()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          disabled={submitting}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="new-password">New password</Label>
          <button type="button" className="text-xs font-bold text-primary" onClick={handleGeneratePassword}>
            Generate
          </button>
        </div>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          disabled={submitting}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least 12 characters.</p>
      </div>
      {revealedPassword && newPassword === revealedPassword && <GeneratedPasswordChip value={revealedPassword} />}
      <div className="space-y-2 rounded-lg border border-secondary/30 bg-secondary/10 p-2.5">
        <div className="flex items-start gap-2">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">This signs you out everywhere</p>
            <p className="text-sm text-muted-foreground">
              Every active session for your account ends the moment you save, including this one — you'll need to
              log in again.
            </p>
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {onCancel ? (
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Changing…' : submitLabel}
          </Button>
        </DialogFooter>
      ) : (
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Changing…' : submitLabel}
        </Button>
      )}
    </form>
  )
}
