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
        data: { id: 'u1', email: 'admin@example.com', role: 'admin' },
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
          data: { id: 'u1', email: 'admin@example.com', role: 'admin' },
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
        data: { id: 'u1', email: 'admin@example.com', role: 'admin' },
      })
    if (path === '/api/v1/projects')
      return Promise.resolve({
        response: { ok: true },
        data: [
          { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' },
          { id: 'p2', name: 'Desktop App', archived: false, createdAt: '' },
        ],
      })
    if (path === '/api/v1/projects/summaries')
      return Promise.resolve({
        response: { ok: true },
        data: [
          { projectId: 'p1', suiteCount: 1, caseCount: 2, passRate: 50 },
          { projectId: 'p2', suiteCount: 0, caseCount: 0, passRate: null },
        ],
      })
    if (path === '/api/v1/projects/{projectId}') {
      const projectId = options?.params?.path?.projectId
      return Promise.resolve({
        response: { ok: true },
        data: { id: projectId, name: projectId === 'p1' ? 'Banca Móvil' : 'Desktop App', archived: false, createdAt: '' },
      })
    }
    if (path === '/api/v1/projects/{projectId}/suites') {
      const projectId = options?.params?.path?.projectId
      if (projectId === 'p1')
        return Promise.resolve({
          response: { ok: true },
          data: [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '' }],
        })
      return Promise.resolve({ response: { ok: true }, data: [] })
    }
    if (path === '/api/v1/projects/{projectId}/cases') {
      const projectId = options?.params?.path?.projectId
      if (projectId === 'p1')
        return Promise.resolve({
          response: { ok: true },
          data: [
            { id: 'c1', projectId: 'p1', folderId: 'f1', currentVersion: 1, createdAt: '', content: { title: 'Case A', steps: [] } },
            { id: 'c2', projectId: 'p1', folderId: 'f1', currentVersion: 1, createdAt: '', content: { title: 'Case B', steps: [] } },
          ],
        })
      return Promise.resolve({ response: { ok: true }, data: [] })
    }
    if (path === '/api/v1/projects/{projectId}/runs') {
      const projectId = options?.params?.path?.projectId
      if (projectId === 'p1')
        return Promise.resolve({
          response: { ok: true },
          data: [{ id: 'r1', projectId: 'p1', name: 'Smoke run', createdAt: '2026-01-01T00:00:00Z' }],
        })
      return Promise.resolve({ response: { ok: true }, data: [] })
    }
    if (path === '/api/v1/runs/{runId}/summary')
      return Promise.resolve({
        response: { ok: true },
        data: { runId: 'r1', total: 2, counts: { pass: 1 } },
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

  it('sizes the wordmark and icon a step larger, so the brand mark reads with real presence', async () => {
    mockProjectData()
    render(<App />)
    const wordmarkLink = await screen.findByRole('link', { name: 'TestPulse' })
    expect(wordmarkLink).toHaveClass('text-2xl')
    const icon = wordmarkLink.querySelector('svg[aria-hidden="true"]')
    expect(icon).toHaveClass('size-[26px]')
  })

  it('hangs the wordmark icon slightly left, so the readable text lines up closer to the page content below it', async () => {
    mockProjectData()
    render(<App />)
    const wordmarkLink = await screen.findByRole('link', { name: 'TestPulse' })
    expect(wordmarkLink).toHaveClass('-ml-4')
  })

  it('separates the wordmark from the active project with a breadcrumb-style ›, matching Breadcrumbs.tsx', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/projects/p1')
    render(<App />)
    await screen.findByRole('link', { name: 'Banca Móvil' })
    const header = screen.getByRole('banner')
    expect(within(header).getByText('›')).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('hides the project switcher on the project list itself — it would be redundant there', async () => {
    mockProjectData()
    render(<App />)
    await screen.findByRole('link', { name: 'TestPulse' })
    expect(screen.queryByText('Select project')).not.toBeInTheDocument()
  })

  it('shows the active project name on the switcher on a project route', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/projects/p1')
    render(<App />)
    expect(await screen.findByRole('link', { name: 'Banca Móvil' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('opens the switcher palette with every project and its stats', async () => {
    mockProjectData()
    window.history.pushState({}, '', '/projects/p1')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('link', { name: 'Banca Móvil' })
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
    window.history.pushState({}, '', '/projects/p1')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('link', { name: 'Banca Móvil' })
    await user.click(screen.getByRole('button', { name: /switch project/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByText('Desktop App'))
    expect(await screen.findByRole('link', { name: 'Desktop App' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('resolves the active project from a run route to show its name on the switcher', async () => {
    mockGET.mockImplementation((path: string, options?: { params?: { path?: Record<string, string> } }) => {
      if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
      if (path === '/api/v1/projects')
        return Promise.resolve({
          data: [{ id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }],
          response: { ok: true },
        })
      if (path === '/api/v1/runs/{runId}' && options?.params?.path?.runId === 'r1')
        return Promise.resolve({
          data: { id: 'r1', projectId: 'p1', name: 'Sprint 1', createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/runs/{runId}/items') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/runs/{runId}/summary')
        return Promise.resolve({ data: { runId: 'r1', total: 0, counts: {} }, response: { ok: true } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    window.history.pushState({}, '', '/runs/r1')
    render(<App />)
    expect(await screen.findByRole('link', { name: 'Banca Móvil' })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('hides the user email on mobile but keeps the Log out button, so the header does not overflow', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    mockProjectData()
    render(<App />)
    await screen.findByRole('link', { name: 'TestPulse' })
    expect(screen.queryByText('admin@example.com')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
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
      if (path === '/api/v1/runs/{runId}') return Promise.reject(new Error('network down'))
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    window.history.pushState({}, '', '/runs/r1')
    render(<App />)
    expect(await screen.findByText('Select project')).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })
})
