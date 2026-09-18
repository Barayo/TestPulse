import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthLayout } from '@/components/AuthLayout'
import { GeneratedPasswordChip } from '@/components/GeneratedPasswordChip'
import { generateSecurePassword } from '@/lib/generatePassword'
import { api } from '@/lib/api'

const NETWORK_ERROR = "Couldn't reach the server — check your connection and try again."

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [revealedPassword, setRevealedPassword] = useState<string>()
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [tokenDead, setTokenDead] = useState(false)

  function handleGeneratePassword() {
    const generated = generateSecurePassword()
    setPassword(generated)
    setConfirmPassword(generated)
    setRevealedPassword(generated)
  }

  function handlePasswordChange(value: string) {
    setPassword(value)
    setRevealedPassword(undefined)
  }

  function handleConfirmPasswordChange(value: string) {
    setConfirmPassword(value)
    setRevealedPassword(undefined)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (!password || !confirmPassword) {
      setError('Enter a new password and confirm it.')
      return
    }
    if (password.length < 12) {
      setError('password must be at least 12 characters')
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }
    setSubmitting(true)
    try {
      const { response } = await api.POST('/api/v1/auth/reset-password', {
        body: { token: token ?? '', newPassword: password },
      })
      if (response.ok) {
        navigate('/login', { replace: true, state: { passwordReset: true } })
        return
      }
      if (response.status === 400) {
        setTokenDead(true)
        return
      }
      setError(NETWORK_ERROR)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const showDeadLink = !token || tokenDead

  return (
    <AuthLayout backLink={{ to: '/login', label: 'Back to log in' }}>
      <Card className="w-full max-w-sm">
        {showDeadLink ? (
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">This link no longer works</p>
              <p className="text-sm text-muted-foreground">
                Password reset links expire after 30 minutes and can only be used once.
              </p>
            </div>
            <Button asChild>
              <Link to="/forgot-password">Request a new link</Link>
            </Button>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="tp-heading">Set a new password</CardTitle>
              <CardDescription>Choose a new password for your account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="reset-password-new">New password</Label>
                    <button
                      type="button"
                      className="text-xs font-bold text-primary"
                      onClick={handleGeneratePassword}
                    >
                      Generate
                    </button>
                  </div>
                  <Input
                    id="reset-password-new"
                    type="password"
                    autoComplete="new-password"
                    autoFocus
                    disabled={submitting}
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">At least 12 characters.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reset-password-confirm">Confirm new password</Label>
                  <Input
                    id="reset-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    disabled={submitting}
                    value={confirmPassword}
                    onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                  />
                </div>
                {revealedPassword && password === revealedPassword && confirmPassword === revealedPassword && (
                  <GeneratedPasswordChip value={revealedPassword} />
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Resetting…' : 'Reset password'}
                </Button>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </AuthLayout>
  )
}
