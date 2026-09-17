import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { MailIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthLayout } from '@/components/AuthLayout'
import { api } from '@/lib/api'

const NETWORK_ERROR = "Couldn't reach the server — check your connection and try again."

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string>()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (!email.trim()) {
      setError('Enter your email address')
      return
    }
    setSending(true)
    try {
      const { response } = await api.POST('/api/v1/auth/forgot-password', { body: { email } })
      if (response.status === 429) {
        setError('Too many attempts. Wait a minute and try again.')
        return
      }
      if (!response.ok) {
        setError(NETWORK_ERROR)
        return
      }
      setSentTo(email)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        {sentTo ? (
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MailIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground">
                If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we've sent a
                link to reset your password. It expires in 30 minutes.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Didn't get it? Check spam, or{' '}
              <button type="button" className="text-primary underline" onClick={() => setSentTo(undefined)}>
                try a different email
              </button>
            </p>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="tp-heading">Reset your password</CardTitle>
              <CardDescription>Enter your account email and we'll send a link to reset your password.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="forgot-password-email">Email</Label>
                  <Input
                    id="forgot-password-email"
                    type="email"
                    autoFocus
                    disabled={sending}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={sending}>
                  {sending ? 'Sending…' : 'Send reset link'}
                </Button>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </form>
            </CardContent>
          </>
        )}
      </Card>
      <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
        Back to log in
      </Link>
    </AuthLayout>
  )
}
