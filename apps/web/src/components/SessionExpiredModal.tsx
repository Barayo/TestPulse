import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, type AuthUser } from '@/lib/useAuth'
import { LoginForm } from '@/components/LoginForm'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'

// Non-dismissable by design — a session going invalid mid-use isn't
// optional to resolve, and the only way out is a successful re-login
// (handle-session-expiry). Resolution is always a hard browser navigation
// (reload for the same user, home for a different one), so there's no
// "close" state to manage here.
export function SessionExpiredModal() {
  const { t } = useTranslation()
  const { user, sessionExpired } = useAuth()
  const passwordRef = useRef<HTMLInputElement>(null)
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(false)

  useEffect(() => {
    void api
      .GET('/api/v1/meta')
      .then(({ data }) => {
        if (data) setPasswordResetEnabled(data.passwordResetEnabled)
      })
      .catch(() => {})
  }, [])

  function handleSuccess(newUser: AuthUser) {
    if (user && newUser.id === user.id) {
      window.location.reload()
    } else {
      window.location.href = '/'
    }
  }

  return (
    <Dialog open={sessionExpired}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          passwordRef.current?.focus()
        }}
      >
        <DialogTitle>{t('SessionExpiredModal.title')}</DialogTitle>
        <DialogDescription>{t('SessionExpiredModal.description')}</DialogDescription>
        <LoginForm
          onSuccess={handleSuccess}
          initialEmail={user?.email}
          passwordInputRef={passwordRef}
          showForgotPassword={passwordResetEnabled}
        />
      </DialogContent>
    </Dialog>
  )
}
