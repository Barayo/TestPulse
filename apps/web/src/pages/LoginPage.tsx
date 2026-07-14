import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HealthBadge } from '@/components/HealthBadge'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    const result = await login(email, password)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    navigate(from, { replace: true })
  }

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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Log in
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
