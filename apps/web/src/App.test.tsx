import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App, { PROJECT_CONTENT_ROUTES, ACCOUNT_ONLY_ROUTES } from './App'
import { api } from '@/lib/api'
import i18next from '@/i18n/index.ts'

// Route-manifest test (design.md D9, unify-authenticated-and-public-views):
// every route in the app is registered from exactly one of these two
// arrays — App.tsx's <Routes> has no third source. This test fails if a
// route is ever duplicated across the two lists or within one of them,
// converting "someone must remember which list a new route belongs in"
// into a structural check.
describe('App route categorization', () => {
  it('registers every project-content and account-only path exactly once, with no overlap between the two groups', () => {
    const projectContentPaths = PROJECT_CONTENT_ROUTES.map((r) => r.path)
    const accountOnlyPaths = ACCOUNT_ONLY_ROUTES.map((r) => r.path)

    expect(new Set(projectContentPaths).size).toBe(projectContentPaths.length)
    expect(new Set(accountOnlyPaths).size).toBe(accountOnlyPaths.length)

    const overlap = projectContentPaths.filter((p) => accountOnlyPaths.includes(p))
    expect(overlap).toEqual([])
  })
})

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() },
}))

const mockGET = vi.mocked(api.GET)

function mockReadyz(ok: boolean) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/readyz') {
      return Promise.resolve({ response: { ok } })
    }
    if (path === '/api/v1/meta') {
      return Promise.resolve({
        response: { ok: true },
        data: { name: 'TestPulse', version: '0.0.1' },
      })
    }
    if (path === '/api/v1/users/me') {
      return Promise.resolve({
        response: { ok: true },
        data: { id: 'u1', email: 'admin@example.com', isTenantAdmin: true },
      })
    }
    // ProjectsPage's own data fetch (irrelevant to these health-badge tests).
    return Promise.resolve({ response: { ok: true }, data: [] })
  })
}

beforeEach(() => {
  mockGET.mockReset()
  // RequireAuth's redirect to /login uses real browser history (BrowserRouter);
  // reset it so an unauthenticated test doesn't leak its navigation into the
  // next test, which typically assumes it starts at "/".
  window.history.pushState({}, '', '/')
  // Default every test to desktop; tests exercising mobile-only behavior
  // override this themselves (matches the pattern in ProjectsPage.test.tsx).
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

describe('App health status', () => {
  it('shows "System ready" when the API readiness check succeeds', async () => {
    mockReadyz(true)
    render(<App />)
    expect(await screen.findByText('System ready')).toBeInTheDocument()
  })

  it('shows the API version once loaded', async () => {
    mockReadyz(true)
    render(<App />)
    expect(await screen.findByText('v0.0.1')).toBeInTheDocument()
  })

  it('shows "API unavailable" when readiness returns an error status', async () => {
    mockReadyz(false)
    render(<App />)
    expect(await screen.findByText('API unavailable')).toBeInTheDocument()
  })

  it('shows "API unavailable" when the API cannot be reached at all', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    render(<App />)
    expect(await screen.findByText('API unavailable')).toBeInTheDocument()
  })

  it('shows a checking state while the request is in flight', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') {
        // Resolve the session check quickly so the authenticated shell (and
        // its health badge) renders; /readyz itself is what stays pending.
        return Promise.resolve({
          response: { ok: true },
          data: { id: 'u1', email: 'admin@example.com', isTenantAdmin: true },
        })
      }
      return new Promise(() => {}) // never resolves
    })
    render(<App />)
    expect(await screen.findByText('Checking…')).toBeInTheDocument()
  })
})

function mockProjectData() {
  mockGET.mockImplementation((path: string, options?: { params?: { path?: Record<string, string> } }) => {
    if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
    if (path === '/api/v1/meta')
      return Promise.resolve({ response: { ok: true }, data: { name: 'TestPulse', version: '0.0.1' } })
    if (path === '/api/v1/users/me')
      return Promise.resolve({
        response: { ok: true },
        data: { id: 'u1', email: 'admin@example.com', isTenantAdmin: true },
      })
    if (path === '/api/v1/projects')
      return Promise.resolve({
        response: { ok: true },
        data: [
          { id: 'id1', key: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' },
          { id: 'id2', key: 'p2', name: 'Desktop App', archived: false, createdAt: '' },
        ],
      })
    if (path === '/api/v1/projects/summaries')
      return Promise.resolve({
        response: { ok: true },
        data: [
          { projectId: 'id1', suiteCount: 1, caseCount: 2, passRate: 50 },
          { projectId: 'id2', suiteCount: 0, caseCount: 0, passRate: null },
        ],
      })
    if (path === '/api/v1/projects/{projectKey}') {
      const projectKey = options?.params?.path?.projectKey
      return Promise.resolve({
        response: { ok: true },
        data: {
          id: projectKey === 'p1' ? 'id1' : 'id2',
          key: projectKey,
          name: projectKey === 'p1' ? 'Banca Móvil' : 'Desktop App',
          archived: false,
          createdAt: '',
        },
      })
    }
    if (path === '/api/v1/projects/{projectKey}/suites') {
      const projectKey = options?.params?.path?.projectKey
      if (projectKey === 'p1')
        return Promise.resolve({
          response: { ok: true },
          data: { items: [{ id: 'sid1', key: 'p1-S1', projectId: 'id1', name: 'Smoke', caseIds: [], createdAt: '' }], nextCursor: null },
        })
      return Promise.resolve({ response: { ok: true }, data: { items: [], nextCursor: null } })
    }
    if (path === '/api/v1/projects/{projectKey}/cases') {
      const projectKey = options?.params?.path?.projectKey
      if (projectKey === 'p1')
        return Promise.resolve({
          response: { ok: true },
          data: {
            items: [
              { id: 'cid1', key: 'p1-1', projectId: 'id1', folderId: 'f1', currentVersion: 1, createdAt: '', content: { title: 'Case A', steps: [] } },
              { id: 'cid2', key: 'p1-2', projectId: 'id1', folderId: 'f1', currentVersion: 1, createdAt: '', content: { title: 'Case B', steps: [] } },
            ],
            nextCursor: null,
          },
        })
      return Promise.resolve({ response: { ok: true }, data: { items: [], nextCursor: null } })
    }
    if (path === '/api/v1/projects/{projectKey}/runs') {
      const projectKey = options?.params?.path?.projectKey
      if (projectKey === 'p1')
        return Promise.resolve({
          response: { ok: true },
          data: {
            items: [{ id: 'rid1', key: 'p1-R1', projectId: 'id1', projectKey: 'p1', name: 'Smoke run', createdAt: '2026-01-01T00:00:00Z' }],
            nextCursor: null,
          },
        })
      return Promise.resolve({ response: { ok: true }, data: { items: [], nextCursor: null } })
    }
    if (path === '/api/v1/runs/{runKey}/summary')
      return Promise.resolve({
        response: { ok: true },
        data: { runId: 'rid1', total: 2, counts: { pass: 1 } },
      })
    if (path === '/api/v1/projects/{projectKey}/folders') return Promise.resolve({ response: { ok: true }, data: { items: [], nextCursor: null } })
    if (path === '/api/v1/users' || path === '/api/v1/teams' || path === '/api/v1/roles')
      return Promise.resolve({ response: { ok: true }, data: { items: [], nextCursor: null } })
    return Promise.resolve({ response: { ok: true }, data: [] })
  })
}

describe('App shell', () => {
  it('renders the product title and the projects page at /', async () => {
    mockProjectData()
    render(<App />)
    expect(await screen.findByRole('link', { name: 'TestPulse' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /new project/i })).toBeInTheDocument()
    await screen.findByText('System ready') // avoid act() warnings
  })

  it('renders the wordmark in two colors and two Recursive-axis treatments, matching the brand logo\'s Test/Pulse split', async () => {
    mockProjectData()
    render(<App />)
    const test = await screen.findByText('Test')
    const pulse = screen.getByText('Pulse')
    expect(test).toHaveClass('text-foreground')
    expect(test).toHaveClass('tp-wordmark-test')
    expect(pulse).toHaveClass('text-primary')
    expect(pulse).toHaveClass('tp-wordmark-pulse')
  })

  it('shows the brand icon tile next to the wordmark, matching assets/brand/testpulse-icon.svg', async () => {
    mockProjectData()
    render(<App />)
    await screen.findByRole('link', { name: 'TestPulse' })
    const header = screen.getByRole('banner')
    const icon = header.querySelector('svg[aria-hidden="true"]')
    expect(icon).toBeInTheDocument()
  })

  it('sizes the wordmark and icon so the wordmark keeps a clear but not overwhelming lead over the project name', async () => {
    mockProjectData()
    render(<App />)
    const wordmarkLink = await screen.findByRole('link', { name: 'TestPulse' })
    expect(wordmarkLink).toHaveClass('text-[24px]')
    const icon = wordmarkLink.querySelector('svg[aria-hidden="true"]')
    expect(icon).toHaveClass('size-[26px]')
  })

  it('hangs the wordmark icon slightly left, so the readable text lines up closer to the page content below it', async () => {
    mockProjectData()
    render(<App />)
    const wordmarkLink = await screen.findByRole('link', { name: 'TestPulse' })
    expect(wordmarkLink).toHaveClass('-ml-5')
  })

  it('separates the wordmark from the active project with a breadcrumb-style ›, matching Breadcrumbs.tsx', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/projects/p1/suites')
    render(<App />)
    const header = await screen.findByRole('banner')
    await within(header).findByRole('link', { name: 'Banca Móvil' })
    expect(within(header).getByText('›')).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('hides the project switcher on the project list itself — it would be redundant there', async () => {
    mockProjectData()
    render(<App />)
    await screen.findByRole('link', { name: 'TestPulse' })
    expect(screen.queryByText('Select project')).not.toBeInTheDocument()
  })

  it('shows the active project name on the switcher on a nested project route', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/projects/p1/suites')
    render(<App />)
    const header = await screen.findByRole('banner')
    expect(await within(header).findByRole('link', { name: 'Banca Móvil' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it("shows no chip in the header on the project's own landing page — just the wordmark, since the page's own heading already establishes the project", async () => {
    mockProjectData()
    window.history.pushState({}, '', '/projects/p1')
    render(<App />)
    await screen.findByRole('heading', { name: 'Banca Móvil' })
    const header = screen.getByRole('banner')
    expect(within(header).queryByText('›')).not.toBeInTheDocument()
    expect(within(header).queryByRole('link', { name: 'Banca Móvil' })).not.toBeInTheDocument()
    expect(within(header).queryByRole('button', { name: /switch project/i })).not.toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('still opens the switcher via the keyboard shortcut while on the landing page, even with no header chip', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/projects/p1')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Banca Móvil' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('opens the switcher palette with every project and its stats', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/projects/p1/suites')
    const user = userEvent.setup()
    render(<App />)
    const header = await screen.findByRole('banner')
    await within(header).findByRole('link', { name: 'Banca Móvil' })
    await user.click(screen.getByRole('button', { name: /switch project/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Banca Móvil')).toBeInTheDocument()
    expect(within(dialog).getByText(/1 suites/)).toBeInTheDocument()
    expect(within(dialog).getByText(/2 cases/)).toBeInTheDocument()
    expect(within(dialog).getByText(/50% pass/)).toBeInTheDocument()
    expect(within(dialog).getByText('Desktop App')).toBeInTheDocument()
    expect(within(dialog).getByText(/no runs/i)).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('navigates to the selected project when chosen from the switcher palette', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/projects/p1/suites')
    const user = userEvent.setup()
    render(<App />)
    const header = await screen.findByRole('banner')
    await within(header).findByRole('link', { name: 'Banca Móvil' })
    await user.click(screen.getByRole('button', { name: /switch project/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByText('Desktop App'))
    // Selecting a project navigates to its own landing page, which shows no
    // header chip (above) — so navigation is confirmed via the landing
    // page's own heading, not the (now absent) chip link.
    expect(await screen.findByRole('heading', { name: 'Desktop App' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('resolves the active project from a run route to show its name on the switcher', async () => {
    mockGET.mockImplementation((path: string, options?: { params?: { path?: Record<string, string> } }) => {
      if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
      if (path === '/api/v1/users/me')
        return Promise.resolve({
          data: { id: 'u1', email: 'admin@example.com', isTenantAdmin: true },
          response: { ok: true },
        })
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: [{ id: 'id1', key: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }],
          response: { ok: true },
        })
      if (path === '/api/v1/runs/{runKey}' && options?.params?.path?.runKey === 'r1')
        return Promise.resolve({
          data: { id: 'rid1', key: 'r1', projectId: 'id1', projectKey: 'p1', name: 'Sprint 1', createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/runs/{runKey}/items') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/runs/{runKey}/summary')
        return Promise.resolve({ data: { runId: 'rid1', total: 0, counts: {} }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({
          data: { id: 'id1', key: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' },
          response: { ok: true },
        })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    window.history.pushState({}, '', '/runs/r1')
    render(<App />)
    expect(await screen.findByRole('link', { name: 'Banca Móvil' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('truncates the user menu trigger on mobile so a long email cannot overflow the header', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    mockProjectData()
    render(<App />)
    await screen.findByRole('link', { name: 'TestPulse' })
    const trigger = screen.getByRole('button', { name: 'admin@example.com' })
    expect(trigger).toHaveClass('truncate')
  })

  it('shows the health status and version in a footer, not the header — plenty of room there regardless of viewport', async () => {
    mockProjectData()
    render(<App />)
    const footer = await screen.findByRole('contentinfo')
    expect(await within(footer).findByText('System ready')).toBeInTheDocument()
    expect(within(footer).getByText('v0.0.1')).toBeInTheDocument()
  })

  it('shows the user email on desktop', async () => {
    mockProjectData()
    render(<App />)
    expect(await screen.findByText('admin@example.com')).toBeInTheDocument()
  })

  it('falls back to no active project when resolving it from a run route fails', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
      if (path === '/api/v1/users/me')
        return Promise.resolve({
          data: { id: 'u1', email: 'admin@example.com', isTenantAdmin: true },
          response: { ok: true },
        })
      if (path === '/api/v1/runs/{runKey}') return Promise.reject(new Error('network down'))
      if (path === '/api/v1/runs/{runKey}/summary')
        return Promise.resolve({ data: { runId: 'rid1', total: 0, counts: {} }, response: { ok: true } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    window.history.pushState({}, '', '/runs/r1')
    render(<App />)
    expect(await screen.findByText('Select project')).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('shows "Administration" instead of the project switcher on an admin settings page, which has no project to select', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/settings/people')
    render(<App />)
    await screen.findByRole('link', { name: 'TestPulse' })
    expect(await screen.findByText('Administration')).toBeInTheDocument()
    expect(screen.queryByText('Select project')).not.toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('hides the project switcher on the personal tokens settings page too — not project-scoped, not an admin page either', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/settings/tokens')
    render(<App />)
    await screen.findByRole('link', { name: 'TestPulse' })
    expect(screen.queryByText('Select project')).not.toBeInTheDocument()
    expect(screen.queryByText('Administration')).not.toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })
})

// The gate is rendered by RequireAuth in place of whatever route was
// requested — it has no URL of its own (add-change-own-password).
describe('Required password change gate', () => {
  function mockFlaggedUser() {
    mockGET.mockImplementation((path: string) => {
      if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
      if (path === '/api/v1/meta')
        return Promise.resolve({ response: { ok: true }, data: { name: 'TestPulse', version: '0.0.1' } })
      if (path === '/api/v1/users/me')
        return Promise.resolve({
          response: { ok: true },
          data: { id: 'u1', email: 'admin@example.com', isTenantAdmin: true, mustChangePassword: true },
        })
      return Promise.resolve({ response: { ok: true }, data: [] })
    })
  }

  it('shows the gate instead of the requested route when mustChangePassword is true', async () => {
    mockFlaggedUser()
    render(<App />)

    expect(await screen.findByText(/set a new password/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument()
  })

  it('does not show the gate for an unflagged user', async () => {
    mockProjectData()
    render(<App />)

    await screen.findByRole('button', { name: /new project/i })
    expect(screen.queryByText(/set a new password/i)).not.toBeInTheDocument()
  })
})

// add-first-run-setup: a fresh instance (zero users) redirects every route
// to /setup, ahead of the ordinary /login redirect — checked on both
// RequireAuth (account-only routes) and AllowAnonymous (`/` itself).
describe('First-run setup redirect', () => {
  function mockSetupRequired() {
    mockGET.mockImplementation((path: string) => {
      if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
      if (path === '/api/v1/meta')
        return Promise.resolve({ response: { ok: true }, data: { name: 'TestPulse', version: '0.0.1', setupRequired: true } })
      if (path === '/api/v1/users/me') return Promise.resolve({ response: { ok: false }, data: undefined })
      return Promise.resolve({ response: { ok: true }, data: [] })
    })
  }

  it('redirects the anonymous root route to /setup when the instance has zero users', async () => {
    mockSetupRequired()
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/setup'))
  })

  it('redirects an account-only route to /setup when the instance has zero users', async () => {
    mockSetupRequired()
    window.history.pushState({}, '', '/settings/people')
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/setup'))
    window.history.pushState({}, '', '/')
  })
})

// add-color-theme-customization: end-to-end wiring from GET /api/v1/meta
// through useAuth into ThemeProvider, applied to the real document root —
// each layer's own tests (useAuth.test.tsx, ThemeProvider.test.tsx) cover
// the pieces in isolation; this confirms App.tsx actually wires them
// together (AuthProvider now an ancestor of ThemeProvider so it can read
// colorTheme/customPalette from context).
describe('Instance color theme', () => {
  it('applies the resolved preset as a data-palette attribute on first render', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
      if (path === '/api/v1/meta')
        return Promise.resolve({ response: { ok: true }, data: { name: 'TestPulse', version: '0.0.1', colorTheme: 'forest' } })
      if (path === '/api/v1/users/me') return Promise.resolve({ response: { ok: false }, data: undefined })
      return Promise.resolve({ response: { ok: true }, data: [] })
    })
    render(<App />)
    await waitFor(() => expect(document.documentElement.getAttribute('data-palette')).toBe('forest'))
  })
})

// Old /public* URLs become plain redirects, not 404s (design.md D7,
// unify-authenticated-and-public-views tasks.md 12.1/12.2) — someone who
// already has a /public/{key} link (documented, potentially shared) should
// land on the unified page, not break. The redirect itself must be
// existence-blind: it never checks whether the project exists or is
// public before firing — the destination page (already unwrapped, tasks
// 1.3/10.4) owns that decision entirely. Proven here by mocking every GET
// to hang forever: if the redirect waited on any network round-trip
// first, the URL would never change.
describe('legacy /public* redirects', () => {
  it('redirects /public/:projectKey to /projects/:projectKey without waiting on any network request', async () => {
    mockGET.mockReturnValue(new Promise(() => {}))
    window.history.pushState({}, '', '/public/SP')
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/projects/SP'))
    window.history.pushState({}, '', '/')
  })

  it('redirects /public to / without waiting on any network request', async () => {
    mockGET.mockReturnValue(new Promise(() => {}))
    window.history.pushState({}, '', '/public')
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })
})

// add-ui-i18n design.md D4: the active i18next locale follows
// resolveLanguage()'s resolution order once AuthProvider's /meta and
// /users/me fetches settle.
describe('App language resolution', () => {
  // i18next is a true module-level singleton, shared across every test
  // file in this run (registered once in src/test/setup.ts) — reset it
  // after each test here so a changed language never leaks into an
  // unrelated test elsewhere that renders English text unconditionally.
  afterEach(async () => {
    await i18next.changeLanguage('en')
  })

  function mockMetaAndUser(meta: Record<string, unknown>, user: Record<string, unknown> | null) {
    mockGET.mockImplementation((path: string) => {
      if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
      if (path === '/api/v1/meta') {
        return Promise.resolve({
          response: { ok: true },
          data: { name: 'TestPulse', version: '0.0.1', ...meta },
        })
      }
      if (path === '/api/v1/users/me') {
        return Promise.resolve(user ? { response: { ok: true }, data: user } : { response: { ok: false } })
      }
      return Promise.resolve({ response: { ok: true }, data: [] })
    })
  }

  it('uses the instance default when per-user customization is disabled, even if the user has a personal language', async () => {
    mockMetaAndUser(
      { defaultLanguage: 'es', perUserLanguageEnabled: false },
      { id: 'u1', email: 'a@example.com', isTenantAdmin: true, language: 'fr' },
    )
    render(<App />)
    await waitFor(() => expect(i18next.language).toBe('es'))
  })

  it("uses the user's personal language when per-user customization is enabled and they have one set", async () => {
    mockMetaAndUser(
      { defaultLanguage: 'en', perUserLanguageEnabled: true },
      { id: 'u1', email: 'a@example.com', isTenantAdmin: true, language: 'de' },
    )
    render(<App />)
    await waitFor(() => expect(i18next.language).toBe('de'))
  })

  it('uses the instance default for an anonymous visitor regardless of the per-user setting', async () => {
    mockMetaAndUser({ defaultLanguage: 'pt', perUserLanguageEnabled: true }, null)
    render(<App />)
    await waitFor(() => expect(i18next.language).toBe('pt'))
  })
})
