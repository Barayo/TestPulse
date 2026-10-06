import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthLayout } from '@/components/AuthLayout'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'

// Rendered by RequireAuth in place of the requested route (never reachable
// via its own URL) whenever the authenticated user's account has
// mustChangePassword set — after an admin flagged it, or after a
// generated temporary password (add-change-own-password). Mandatory, no
// dismiss: the account owner already knows their current password (they
// just used it to log in), so there's nothing to escape to.
export default function RequiredPasswordChangePage() {
  const { t } = useTranslation()
  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="tp-heading">{t('RequiredPasswordChangePage.title')}</CardTitle>
          <CardDescription>{t('RequiredPasswordChangePage.description')}</CardDescription>
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
            submitLabel={t('RequiredPasswordChangePage.submitLabel')}
          />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
