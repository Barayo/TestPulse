import { useState, type FormEvent, type RefObject } from 'react'
import { Link } from 'react-router'
import { useAuth, type AuthUser } from '@/lib/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Shared by LoginPage (first-load / cold-start login) and
// SessionExpiredModal (mid-use re-login) so the actual email/password/error
// logic exists in exactly one place (handle-session-expiry).
export function LoginForm({
  onSuccess,
  initialEmail = '',
  passwordInputRef,
  showForgotPassword = false,
}: {
  onSuccess: (user: AuthUser) => void
  initialEmail?: string
  // The modal focuses password (not email) on open, since a pre-filled
  // email means the common case only needs a password keystroke — that's a
  // dialog-level concern (Radix's onOpenAutoFocus), not this form's, hence
  // exposing the input rather than owning the decision itself.
  passwordInputRef?: RefObject<HTMLInputElement | null>
  // Each caller resolves its own passwordResetEnabled (GET /api/v1/meta)
  // and passes the result through — this form has no opinion on whether
  // the feature is available (add-forgot-password).
  showForgotPassword?: boolean
}) {
  const { login } = useAuth()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    const result = await login(email, password)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSuccess(result.user)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoFocus={!initialEmail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Password</Label>
          {showForgotPassword && (
            <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          )}
        </div>
        <Input
          id="login-password"
          type="password"
          ref={passwordInputRef}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full">
        Log in
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
