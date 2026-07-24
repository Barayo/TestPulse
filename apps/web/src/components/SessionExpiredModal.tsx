import { useRef } from 'react'
import { useAuth, type AuthUser } from '@/lib/useAuth'
import { LoginForm } from '@/components/LoginForm'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

// Non-dismissable by design — a session going invalid mid-use isn't
// optional to resolve, and the only way out is a successful re-login
// (handle-session-expiry). Resolution is always a hard browser navigation
// (reload for the same user, home for a different one), so there's no
// "close" state to manage here.
export function SessionExpiredModal() {
  const { user, sessionExpired } = useAuth()
  const passwordRef = useRef<HTMLInputElement>(null)

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
        <DialogTitle>Your session has expired</DialogTitle>
        <DialogDescription>Log back in to continue where you left off.</DialogDescription>
        <LoginForm onSuccess={handleSuccess} initialEmail={user?.email} passwordInputRef={passwordRef} />
      </DialogContent>
    </Dialog>
  )
}
