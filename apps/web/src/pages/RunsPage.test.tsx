import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import RunsPage from './RunsPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

type RunFixture = {
  id: string
  key: string
  projectId: string
  name: string
  status: 'open' | 'closed'
  passRate?: number | null
  createdAt: string
}

function run(overrides: Partial<RunFixture> & { name: string }): RunFixture {
  return {
    id: overrides.name,
    key: `p1-${overrides.name}`,
    projectId: 'p1',
    status: 'open',
    passRate: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function mockRunsAPI(runs: RunFixture[] = []) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({
        data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/runs') return Promise.resolve({ data: runs, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderRuns() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/runs']}>
      <Routes>
        <Route path="/projects/:projectKey/runs" element={<RunsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('RunsPage', () => {
  it('shows no breadcrumb — the header chip already covers the project, and the page heading already says "Runs"', async () => {
    mockRunsAPI()
    renderRuns()
    await screen.findByText('Runs', { selector: '[data-slot="card-title"]' })
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
  })

  it('shows the runs list as the primary content, not a run-creation form', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' })])
    renderRuns()
    await screen.findByRole('link', { name: /sprint 1/i })
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create run/i })).not.toBeInTheDocument()
  })

  it('lists runs as links to their execution board', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' })])
    renderRuns()
    const runLink = await screen.findByRole('link', { name: /sprint 1/i })
    expect(runLink).toHaveAttribute('href', '/runs/p1-Sprint 1')
  })

  it('offers a "+ New run" button linking to the dedicated creation route', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' })])
    renderRuns()
    const link = await screen.findByRole('link', { name: /\+ new run/i })
    expect(link).toHaveAttribute('href', '/projects/p1/runs/new')
  })

  it('groups runs into Open and Closed sections, each labeled with a count', async () => {
    mockRunsAPI([
      run({ name: 'Nightly', status: 'open' }),
      run({ name: 'Release 1.0', status: 'closed' }),
      run({ name: 'Release 1.1', status: 'closed' }),
    ])
    renderRuns()
    await screen.findByRole('link', { name: /nightly/i })
    expect(screen.getByText(/open/i)).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/closed/i)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows a pass-rate health bar and relative date per row', async () => {
    mockRunsAPI([
      run({ name: 'Nightly', status: 'open', passRate: 75, createdAt: new Date(Date.now() - 3600_000).toISOString() }),
      run({ name: 'Never run', status: 'open', passRate: null }),
    ])
    renderRuns()
    await screen.findByRole('link', { name: /nightly/i })
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText(/1 hour ago/i)).toBeInTheDocument()
    expect(screen.getByText(/not run yet/i)).toBeInTheDocument()
  })

  it('caps the Closed section at 10 rows, with a control to reveal the rest', async () => {
    const closedRuns = Array.from({ length: 13 }, (_, i) => run({ name: `Closed ${i + 1}`, status: 'closed' }))
    mockRunsAPI(closedRuns)
    renderRuns()
    await screen.findByRole('link', { name: /closed 1$/i })
    expect(screen.queryByRole('link', { name: /closed 11$/i })).not.toBeInTheDocument()
    const showMore = screen.getByRole('button', { name: /show 3 more closed runs/i })

    await userEvent.click(showMore)
    expect(await screen.findByRole('link', { name: /closed 11$/i })).toBeInTheDocument()
  })

  it('shows an inline empty message for a section with no runs, when the other has some', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' })])
    renderRuns()
    await screen.findByRole('link', { name: /sprint 1/i })
    expect(screen.getByText(/no closed runs yet/i)).toBeInTheDocument()
  })

  it('shows a single unified empty state when there are no runs at all', async () => {
    mockRunsAPI([])
    renderRuns()
    expect(await screen.findByText(/no runs yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/no closed runs yet/i)).not.toBeInTheDocument()
  })

  it('recovers gracefully when the API is unreachable', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    renderRuns()
    expect(await screen.findByText(/no runs yet/i)).toBeInTheDocument()
  })

  it('shows a not-found message instead of an empty, interactive project when the project does not exist', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderRuns()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
  })
})
