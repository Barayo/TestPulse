import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthLayout } from '@/components/AuthLayout'
import { GeneratedPasswordChip } from '@/components/GeneratedPasswordChip'
import { generateSecurePassword } from '@/lib/generatePassword'
import { useAuth } from '@/lib/useAuth'

// First-run setup (add-first-run-setup): whoever loads a fresh instance
// (zero users, no env-var bootstrap) creates the Tenant Admin account
// themselves — their own email and password, chosen directly, not a
// temporary one. Shares AuthLayout/Card with LoginPage/ResetPasswordPage
// (add-auth-split-screen-redesign) rather than a new visual language.
export default function SetupPage() {
  const { t } = useTranslation()
  const NETWORK_ERROR = t('SetupPage.networkError')
  const navigate = useNavigate()
  const { setup, setupRequired, setupRequiredLoading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [revealedPassword, setRevealedPassword] = useState<string>()
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  // A successful submission on THIS page also flips setupRequired to false
  // (it's no longer required — setup just happened) — without this flag,
  // that side effect would trip the stale-visit guard below on the same
  // render, redirecting to /login and racing the real navigate('/') call.
  const justSucceeded = useRef(false)

  // Stale-visit guard: someone reaching /setup by URL/bookmark/back-button
  // after setup already completed elsewhere. Waits for setupRequiredLoading
  // first — its initial value is indistinguishable from "confirmed not
  // required" until the check actually resolves.
  if (!setupRequiredLoading && !setupRequired && !justSucceeded.current) {
    return <Navigate to="/login" replace />
  }

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
      setError(t('SetupPage.enterPasswordError'))
      return
    }
    if (password.length < 12) {
      setError(t('SetupPage.passwordTooShortError'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('SetupPage.passwordsMismatchError'))
      return
    }
    setSubmitting(true)
    try {
      const result = await setup(email, password)
      if (result.ok) {
        justSucceeded.current = true
        // Auto-login, straight to /: unlike ResetPasswordPage's detour
        // through /login with a confirmation banner, there is no prior
        // session or device-switch scenario here to protect a re-login
        // checkpoint for.
        navigate('/', { replace: true })
        return
      }
      if (result.alreadySetUp) {
        navigate('/login', { replace: true, state: { message: result.error } })
        return
      }
      setError(result.error)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="tp-heading">{t('SetupPage.title')}</CardTitle>
          <CardDescription>{t('SetupPage.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2 rounded-lg border border-secondary/30 bg-secondary/10 p-2.5">
              <div className="flex items-start gap-2">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{t('SetupPage.adminWarningHeading')}</p>
                  <p className="text-sm text-muted-foreground">{t('SetupPage.adminWarningBody')}</p>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="setup-email">{t('SetupPage.emailLabel')}</Label>
              <Input
                id="setup-email"
                type="email"
                autoFocus
                disabled={submitting}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="setup-password">{t('SetupPage.passwordLabel')}</Label>
                <button type="button" className="text-xs font-bold text-primary" onClick={handleGeneratePassword}>
                  {t('SetupPage.generateButton')}
                </button>
              </div>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                disabled={submitting}
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('SetupPage.passwordHint')}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="setup-confirm-password">{t('SetupPage.confirmPasswordLabel')}</Label>
              <Input
                id="setup-confirm-password"
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
              {submitting ? t('SetupPage.creatingButton') : t('SetupPage.createAdminAccountButton')}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-center text-xs text-muted-foreground">{t('SetupPage.ssoFooterNote')}</p>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
