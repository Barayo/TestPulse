import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/Breadcrumbs'

type User = {
  id: string
  email: string
  role: 'admin' | 'member'
  deactivatedAt: string | null
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [creating, setCreating] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [error, setError] = useState<string>()

  async function load() {
    const { data } = await api.GET('/api/v1/users')
    if (data) setUsers(data as User[])
  }

  useEffect(() => {
    if (me?.role === 'admin') void load()
  }, [me])

  if (me?.role !== 'admin') {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    const { error: apiError } = await api.POST('/api/v1/users', {
      body: { email, password, role },
    })
    if (apiError) {
      setError((apiError as { error?: string }).error ?? 'failed to create user')
      return
    }
    setEmail('')
    setPassword('')
    setRole('member')
    setCreating(false)
    await load()
  }

  async function handleDeactivate(userId: string) {
    await api.PATCH('/api/v1/users/{userId}', {
      params: { path: { userId } },
      body: { deactivate: true },
    })
    await load()
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={[{ label: 'Users' }]} />
      <div className="flex items-center justify-between">
        <h1 className="tp-heading text-xl">Users</h1>
        <Button onClick={() => setCreating(true)}>+ New user</Button>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">New user</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="new-user-email">Email</Label>
                <Input id="new-user-email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-user-password">Password</Label>
                <Input
                  id="new-user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-user-role">Role</Label>
                <select
                  id="new-user-role"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button type="submit">Create</Button>
            </form>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      <ul className="rounded-lg border">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
            <div>
              <span className="font-medium">{u.email}</span>
              <span className="ml-2 text-sm text-muted-foreground">
                {u.role}
                {u.deactivatedAt && ' · deactivated'}
              </span>
            </div>
            {!u.deactivatedAt && u.id !== me.id && (
              <Button variant="ghost" size="sm" onClick={() => void handleDeactivate(u.id)}>
                Deactivate
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
