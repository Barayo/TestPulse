import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { api } from '@/lib/api'

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
          data: [{ id: 'sid1', key: 'p1-S1', projectId: 'id1', name: 'Smoke', caseIds: [], createdAt: '' }],
        })
      return Promise.resolve({ response: { ok: true }, data: [] })
    }
    if (path === '/api/v1/projects/{projectKey}/cases') {
      const projectKey = options?.params?.path?.projectKey
      if (projectKey === 'p1')
        return Promise.resolve({
          response: { ok: true },
          data: [
            { id: 'cid1', key: 'p1-1', projectId: 'id1', folderId: 'f1', currentVersion: 1, createdAt: '', content: { title: 'Case A', steps: [] } },
            { id: 'cid2', key: 'p1-2', projectId: 'id1', folderId: 'f1', currentVersion: 1, createdAt: '', content: { title: 'Case B', steps: [] } },
          ],
        })
      return Promise.resolve({ response: { ok: true }, data: [] })
    }
    if (path === '/api/v1/projects/{projectKey}/runs') {
      const projectKey = options?.params?.path?.projectKey
      if (projectKey === 'p1')
        return Promise.resolve({
          response: { ok: true },
          data: [{ id: 'rid1', key: 'p1-R1', projectId: 'id1', projectKey: 'p1', name: 'Smoke run', createdAt: '2026-01-01T00:00:00Z' }],
        })
      return Promise.resolve({ response: { ok: true }, data: [] })
    }
    if (path === '/api/v1/runs/{runKey}/summary')
      return Promise.resolve({
        response: { ok: true },
        data: { runId: 'rid1', total: 2, counts: { pass: 1 } },
      })
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
