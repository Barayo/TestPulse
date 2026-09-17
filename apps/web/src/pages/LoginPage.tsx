import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { LoginForm } from '@/components/LoginForm'
import { ConfirmBanner } from '@/components/ConfirmBanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/AuthLayout'
import { api } from '@/lib/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [publicProjectsEnabled, setPublicProjectsEnabled] = useState(false)
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(false)
  const [ssoEnabled, setSsoEnabled] = useState(false)
  const [ssoOnly, setSsoOnly] = useState(false)

  useEffect(() => {
    void api
      .GET('/api/v1/meta')
      .then(({ data }) => {
        if (data) {
          setPublicProjectsEnabled(data.publicProjectsEnabled)
          setPasswordResetEnabled(data.passwordResetEnabled)
          setSsoEnabled(data.ssoEnabled)
          setSsoOnly(data.ssoOnly)
        }
      })
      .catch(() => {})
  }, [])

  // One-shot confirmation banner after navigating here from another page on
  // success or a lost race — same idiom as RunPage's justCreated banner:
  // read router state once, then clear it so a refresh doesn't re-show it.
  // Generalized (add-first-run-setup) to carry an arbitrary `message`
  // beyond the original password-reset-specific `passwordReset` flag —
  // ResetPasswordPage still passes the latter, SetupPage passes the former.
  const routerState = location.state as { passwordReset?: boolean; message?: string } | null
  const [bannerMessage, setBannerMessage] = useState<string | undefined>(
    routerState?.passwordReset
      ? 'Password updated — log in with your new password'
      : routerState?.message,
  )
  useEffect(() => {
    if (!bannerMessage) return
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthLayout>
      {bannerMessage && (
        <div className="w-full max-w-sm">
          <ConfirmBanner message={bannerMessage} onDismiss={() => setBannerMessage(undefined)} />
        </div>
      )}
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="tp-heading">Log in to TestPulse</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!ssoOnly && (
            <LoginForm
              showForgotPassword={passwordResetEnabled}
              onSuccess={() => {
                // Returns to wherever RequireAuth bounced the user from (e.g. a session
                // timeout mid-task) rather than always the projects root — if that page
                // turns out to be inaccessible to whoever just logged in, its own
                // "not found" handling (add-project-rbac) covers that gracefully now,
                // so there's no need to sacrifice the common case (same user, expired
                // session) to guard against the rarer one (a different user).
                const from = (location.state as { from?: string } | null)?.from ?? '/'
                navigate(from, { replace: true })
              }}
            />
          )}
          {ssoEnabled && (
            <Button asChild variant={ssoOnly ? 'default' : 'outline'} className="w-full">
              <a href="/api/v1/auth/oidc/login">Sign in with SSO</a>
            </Button>
          )}
        </CardContent>
      </Card>
      {publicProjectsEnabled && (
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          Browse public projects without an account
        </Link>
      )}
    </AuthLayout>
  )
}
