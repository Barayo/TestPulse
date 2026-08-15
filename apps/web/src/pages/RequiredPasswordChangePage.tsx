import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HealthBadge } from '@/components/HealthBadge'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'

// Rendered by RequireAuth in place of the requested route (never reachable
// via its own URL) whenever the authenticated user's account has
// mustChangePassword set — after an admin flagged it, or after a
// generated temporary password (add-change-own-password). Mandatory, no
// dismiss: the account owner already knows their current password (they
// just used it to log in), so there's nothing to escape to.
export default function RequiredPasswordChangePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <div className="fixed right-6 top-6">
        <HealthBadge />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="tp-heading">Set a new password</CardTitle>
          <CardDescription>Your account requires a new password before continuing.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm
            onSuccess={() => {
              // ChangePasswordForm's success already revoked this session —
              // a full navigation (not client-side) so AuthProvider re-checks
              // from scratch against the new, unauthenticated state, same as
              // any other session-ending action.
              window.location.href = '/login'
            }}
            submitLabel="Set new password"
          />
        </CardContent>
      </Card>
    </div>
  )
}
