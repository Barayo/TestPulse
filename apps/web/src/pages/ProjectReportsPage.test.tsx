import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ProjectReportsPage from './ProjectReportsPage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

let navigatedTo: string | undefined
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => (to: string) => {
      navigatedTo = to
    },
  }
})

const authenticatedUser = { id: 'u1', email: 'admin@example.com', isTenantAdmin: false }

const project = { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' }

function mockReportsAPI(
  summary: unknown = { total: 4, counts: { pass: 3, failed: 1 } },
  flaky: unknown[] = [],
  anonymous = false,
) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me')
      return anonymous
        ? Promise.resolve({ data: undefined, response: { ok: false } })
        : Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    const projectPath = anonymous ? '/api/v1/public/projects/{projectKey}' : '/api/v1/projects/{projectKey}'
    const summaryPath = anonymous
      ? '/api/v1/public/projects/{projectKey}/runs/status-summary'
      : '/api/v1/projects/{projectKey}/runs/status-summary'
    const flakyPath = anonymous ? '/api/v1/public/projects/{projectKey}/flaky-cases' : '/api/v1/projects/{projectKey}/flaky-cases'
    if (path === projectPath) return Promise.resolve({ data: project, response: { ok: true } })
    if (path === summaryPath) return Promise.resolve({ data: summary, response: { ok: true } })
    if (path === flakyPath) return Promise.resolve({ data: flaky, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions' && !anonymous)
      return Promise.resolve({ data: { read: true }, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function renderPage(path = '/projects/p1/reports') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/reports" element={<ProjectReportsPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  navigatedTo = undefined
})

describe('ProjectReportsPage', () => {
  it('shows the project-wide status breakdown', async () => {
    mockReportsAPI()
    renderPage()
    expect(await screen.findByText('75%')).toBeInTheDocument()
  })

  it('shows an empty, project-scoped message when the project has no runs', async () => {
    mockReportsAPI({ total: 0, counts: {} })
    renderPage()
    await screen.findByText('Status breakdown')
    expect(screen.getByText(/no runs yet in this project/i)).toBeInTheDocument()
  })

  it('lists flaky cases sorted by rate, most volatile first', async () => {
    mockReportsAPI(undefined, [
      { caseKey: 'p1-1', caseTitle: 'Low flake', currentVersion: 1, rate: 20 },
      { caseKey: 'p1-2', caseTitle: 'High flake', currentVersion: 2, rate: 45 },
    ])
    renderPage()
    const list = await screen.findByRole('list', { name: /flaky cases/i })
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('High flake')
    expect(rows[1]).toHaveTextContent('Low flake')
  })

  it('a flaky case row links to that case\'s own detail page', async () => {
    mockReportsAPI(undefined, [{ caseKey: 'p1-1', caseTitle: 'Flaky login', currentVersion: 3, rate: 30 }])
    renderPage()
    const link = await screen.findByRole('link', { name: /flaky login/i })
    expect(link).toHaveAttribute('href', '/projects/p1/cases/p1-1')
  })

  it('provides an entry point into run comparison', async () => {
    mockReportsAPI()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /compare runs/i }))
    expect(navigatedTo).toBe('/projects/p1/runs/compare')
  })

  it('works for an anonymous visitor to a public project', async () => {
    mockReportsAPI({ total: 2, counts: { pass: 2 } }, [], true)
    renderPage()
    expect(await screen.findByText('100%')).toBeInTheDocument()
  })
})
