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

// The 10 admin-editable tokens for one light/dark mode of a custom palette
// (add-color-theme-customization) — mirrors domain.CustomPaletteMode.
export type CustomPaletteMode = {
  background: string
  foreground: string
  card: string
  primary: string
  primaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  border: string
  input: string
}

export type CustomPalette = { light: CustomPaletteMode; dark: CustomPaletteMode }

type LoginResult = { ok: true; user: AuthUser } | { ok: false; error: string }
type SetupResult = { ok: true; user: AuthUser } | { ok: false; error: string; alreadySetUp?: boolean }

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  sessionExpired: boolean
  // True while the instance has zero user accounts (add-first-run-setup) —
  // every route redirects to /setup while this is true. Resolved from
  // GET /api/v1/meta alongside the /users/me check; defaults to false on
  // any fetch failure, matching the ordinary case (an already-configured
  // instance) rather than forcing every network hiccup into the setup flow.
  setupRequired: boolean
  // True until the setupRequired check above has resolved once. Deliberately
  // separate from `loading` (which only reflects /users/me and must never
  // block the rest of the app on a slow/hung /api/v1/meta — see the comment
  // above `loading`'s state). SetupPage itself needs this: setupRequired's
  // initial value is `false`, indistinguishable from "confirmed not
  // required" until this resolves, so SetupPage must wait for it before
  // trusting a `false` value enough to redirect away from itself.
  setupRequiredLoading: boolean
  // Re-fetches GET /api/v1/meta and updates colorTheme/customPalette
  // (add-color-theme-customization) — called after InstanceSettingsPage
  // saves a new palette, so ThemeProvider (which reads these from context,
  // not by fetching itself) re-themes the admin's own view immediately,
  // the same "applies live" guarantee every other instance setting already
  // has. Without this, the admin wouldn't see their own change until a
  // full page reload re-ran the mount-time meta fetch.
  refreshColorTheme: () => Promise<void>
  // The instance-wide color palette (add-color-theme-customization),
  // resolved from the same GET /api/v1/meta fetch as setupRequired.
  // Defaults to "teal" — indistinguishable from a fresh instance's real
  // default, so no separate loading flag is needed the way
  // setupRequiredLoading is: rendering "teal" for a moment before the real
  // value resolves is never wrong in a way a stale setupRequired redirect
  // would be.
  colorTheme: string
  // Present only when colorTheme is "custom".
  customPalette: CustomPalette | null
  // Jira Cloud site base URL (add-jira-connector), e.g.
  // "https://mycompany.atlassian.net", resolved from the same GET
  // /api/v1/meta fetch. Empty when a Tenant Admin hasn't configured it —
  // a linked issue key still shows then, just without a working link.
  jiraSiteUrl: string
  // Instance-wide default landing view (add-configurable-project-landing),
  // resolved from the same GET /api/v1/meta fetch. Defaults to "dashboard"
  // — indistinguishable from a fresh instance's real default, same
  // reasoning as colorTheme's "teal" default above: rendering today's
  // existing dashboard for a moment before the real value resolves is
  // never disruptively wrong the way a stale setupRequired redirect would
  // be.
  defaultLandingView: string
  login: (email: string, password: string) => Promise<LoginResult>
  // Creates the instance's first admin account and logs it in, in one
  // request (add-first-run-setup) — updates both `user` and `setupRequired`
  // on success, so navigating away doesn't leave RequireAuth/AllowAnonymous
  // bouncing back to /setup on stale context state. alreadySetUp is set
  // only on a 409 (another visitor, or the env-var bootstrap path, won the
  // race) — SetupPage treats that case as a redirect to /login, not an
  // inline form error.
  setup: (email: string, password: string) => Promise<SetupResult>
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
  // Resolved independently of `loading` (below), which reflects only the
  // /users/me check — a slow or hung /api/v1/meta fetch must never block
  // the rest of the app from rendering (it already doesn't gate readiness
  // display, see HealthBadge). setupRequired simply updates, and any route
  // depending on it re-renders, whenever it resolves.
  const [setupRequired, setSetupRequired] = useState(false)
  const [setupRequiredLoading, setSetupRequiredLoading] = useState(true)
  const [colorTheme, setColorTheme] = useState('teal')
  const [customPalette, setCustomPalette] = useState<CustomPalette | null>(null)
  const [jiraSiteUrl, setJiraSiteUrl] = useState('')
  const [defaultLandingView, setDefaultLandingView] = useState('dashboard')
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
    async function checkSetupRequired() {
      try {
        const { data, response } = await api.GET('/api/v1/meta')
        if (cancelled) return
        const meta = data as
          | {
              setupRequired?: boolean
              colorTheme?: string
              customPalette?: CustomPalette
              jiraSiteUrl?: string
              defaultLandingView?: string
            }
          | undefined
        setSetupRequired(response.ok && meta ? Boolean(meta.setupRequired) : false)
        setColorTheme(response.ok && meta?.colorTheme ? meta.colorTheme : 'teal')
        setCustomPalette(response.ok && meta?.customPalette ? meta.customPalette : null)
        setJiraSiteUrl(response.ok && meta?.jiraSiteUrl ? meta.jiraSiteUrl : '')
        setDefaultLandingView(response.ok && meta?.defaultLandingView ? meta.defaultLandingView : 'dashboard')
      } catch {
        if (!cancelled) {
          setSetupRequired(false)
          setColorTheme('teal')
          setCustomPalette(null)
          setJiraSiteUrl('')
          setDefaultLandingView('dashboard')
        }
      } finally {
        if (!cancelled) setSetupRequiredLoading(false)
      }
    }
    void check()
    void checkSetupRequired()
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

  const setup = useCallback(async (email: string, password: string): Promise<SetupResult> => {
    const { data, error, response } = await api.POST('/api/v1/setup', { body: { email, password } })
    if (!response.ok || !data) {
      if (response.status === 409) {
        return { ok: false, error: 'This instance has already been set up — log in with an existing account.', alreadySetUp: true }
      }
      const message = (error as { error?: string } | undefined)?.error
      return { ok: false, error: message ?? 'Could not create the admin account.' }
    }
    const authUser = data as AuthUser
    setUser(authUser)
    setSetupRequired(false)
    return { ok: true, user: authUser }
  }, [])

  const refreshColorTheme = useCallback(async () => {
    try {
      const { data, response } = await api.GET('/api/v1/meta')
      const meta = data as { colorTheme?: string; customPalette?: CustomPalette; jiraSiteUrl?: string } | undefined
      setColorTheme(response.ok && meta?.colorTheme ? meta.colorTheme : 'teal')
      setCustomPalette(response.ok && meta?.customPalette ? meta.customPalette : null)
      setJiraSiteUrl(response.ok && meta?.jiraSiteUrl ? meta.jiraSiteUrl : '')
    } catch {
      setColorTheme('teal')
      setCustomPalette(null)
      setJiraSiteUrl('')
    }
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
    <AuthContext.Provider
      value={{
        user,
        loading,
        sessionExpired,
        setupRequired,
        setupRequiredLoading,
        colorTheme,
        customPalette,
        jiraSiteUrl,
        defaultLandingView,
        refreshColorTheme,
        login,
        setup,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
