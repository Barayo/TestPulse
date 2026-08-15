import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { onSessionExpired } from '@/lib/sessionExpiry'

export type AuthUser = {
  id: string
  email: string
  isTenantAdmin: boolean
  displayName?: string | null
  avatarKey?: string | null
  timezone?: string | null
  mustChangePassword?: boolean
}

type LoginResult = { ok: true; user: AuthUser } | { ok: false; error: string }

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// The web app authenticates purely via the session cookie (design D7) — on
// mount it asks the API "who am I" rather than persisting a user object
// itself, since only the server can say whether the session is still valid.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const userRef = useRef<AuthUser | null>(null)
  userRef.current = user

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

  // A 401 only means "your session went bad mid-use" if there was a session
  // to begin with — otherwise it's the ordinary first-load case, already
  // handled by RequireAuth's redirect. Never clears `user` here: that's
  // what keeps RequireAuth's own redirect from racing this modal
  // (handle-session-expiry design.md).
  useEffect(() => onSessionExpired(() => {
    if (userRef.current !== null) setSessionExpired(true)
  }), [])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { data, response } = await api.POST('/api/v1/auth/login', { body: { email, password } })
    if (!response.ok || !data) {
      return { ok: false, error: 'Invalid email or password' }
    }
    const authUser = data as AuthUser
    setUser(authUser)
    return { ok: true, user: authUser }
  }, [])

  const logout = useCallback(async () => {
    await api.POST('/api/v1/auth/logout')
    setUser(null)
  }, [])

  // Re-fetches the current user — called after a self-service profile
  // update (add-user-profile) so the header reflects the change without a
  // full page reload.
  const refreshUser = useCallback(async () => {
    const { data, response } = await api.GET('/api/v1/users/me')
    if (response.ok && data) setUser(data as AuthUser)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
