import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import RunsPage from './RunsPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

function mockRunsAPI(runs: unknown[] = []) {
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
  it('shows a breadcrumb: Projects > project name > Runs', async () => {
    mockRunsAPI()
    renderRuns()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(await screen.findByText('QA Platform')).toBeInTheDocument()
    expect(nav).toHaveTextContent('Runs')
  })

  it('shows the runs list as the primary content, not a run-creation form', async () => {
    mockRunsAPI([{ id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Sprint 1', createdAt: '' }])
    renderRuns()
    await screen.findByRole('link', { name: 'Sprint 1' })
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create run/i })).not.toBeInTheDocument()
  })

  it('lists runs as links to their execution board', async () => {
    mockRunsAPI([{ id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Sprint 1', createdAt: '' }])
    renderRuns()
    const runLink = await screen.findByRole('link', { name: 'Sprint 1' })
    expect(runLink).toHaveAttribute('href', '/runs/p1-R1')
  })

  it('offers a "+ New run" button linking to the dedicated creation route', async () => {
    mockRunsAPI()
    renderRuns()
    const link = await screen.findByRole('link', { name: /\+ new run/i })
    expect(link).toHaveAttribute('href', '/projects/p1/runs/new')
  })

  it('shows empty-state copy when there are no runs yet', async () => {
    mockRunsAPI([])
    renderRuns()
    expect(await screen.findByText(/no runs yet/i)).toBeInTheDocument()
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
