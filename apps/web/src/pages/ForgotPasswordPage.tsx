import { useState, type FormEvent } from 'react'
import { MailIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthLayout } from '@/components/AuthLayout'
import { api } from '@/lib/api'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const NETWORK_ERROR = t('ForgotPasswordPage.networkError')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string>()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (!email.trim()) {
      setError(t('ForgotPasswordPage.enterEmailError'))
      return
    }
    setSending(true)
    try {
      const { response } = await api.POST('/api/v1/auth/forgot-password', { body: { email } })
      if (response.status === 429) {
        setError(t('ForgotPasswordPage.tooManyAttemptsError'))
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
    <AuthLayout backLink={{ to: '/login', label: t('ForgotPasswordPage.backToLoginLink') }}>
      <Card className="w-full max-w-sm">
        {sentTo ? (
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MailIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">{t('ForgotPasswordPage.checkEmailHeading')}</p>
              <p className="text-sm text-muted-foreground">
                {t('ForgotPasswordPage.checkEmailBodyPrefix')}
                <span className="font-medium text-foreground">{sentTo}</span>
                {t('ForgotPasswordPage.checkEmailBodySuffix')}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('ForgotPasswordPage.resendPromptPrefix')}
              <button type="button" className="text-primary underline" onClick={() => setSentTo(undefined)}>
                {t('ForgotPasswordPage.resendPromptLink')}
              </button>
            </p>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="tp-heading">{t('ForgotPasswordPage.title')}</CardTitle>
              <CardDescription>{t('ForgotPasswordPage.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="forgot-password-email">{t('ForgotPasswordPage.emailLabel')}</Label>
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
                  {sending ? t('ForgotPasswordPage.sendingButton') : t('ForgotPasswordPage.sendResetLinkButton')}
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
