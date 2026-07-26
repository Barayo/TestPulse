import { useLocation, useNavigate } from 'react-router'
import { LoginForm } from '@/components/LoginForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HealthBadge } from '@/components/HealthBadge'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <div className="fixed right-6 top-6">
        <HealthBadge />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="tp-heading">Log in to TestPulse</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm
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
        </CardContent>
      </Card>
    </div>
  )
}
