import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'

export type AuthUser = { id: string; email: string; role: 'admin' | 'member' }

type LoginResult = { ok: true } | { ok: false; error: string }

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// The web app authenticates purely via the session cookie (design D7) — on
// mount it asks the API "who am I" rather than persisting a user object
// itself, since only the server can say whether the session is still valid.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const { data, response } = await api.GET('/api/v1/users/me')
        if (cancelled) return
        setUser(response.ok && data ? (data as AuthUser) : null)
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { data, response } = await api.POST('/api/v1/auth/login', { body: { email, password } })
    if (!response.ok || !data) {
      return { ok: false, error: 'Invalid email or password' }
    }
    setUser(data as AuthUser)
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    await api.POST('/api/v1/auth/logout')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
