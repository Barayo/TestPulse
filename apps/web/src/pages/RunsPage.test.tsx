import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RunsPage from './RunsPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

const testCase = {
  id: 'c1',
  projectId: 'p1',
  folderId: 'root',
  currentVersion: 1,
  content: { title: 'Login works', description: '', steps: [], expectedResult: '', priority: 'medium', tags: [] },
  createdAt: '',
}

function mockRunsAPI(cases: unknown[] = [], runs: unknown[] = []) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectId}')
      return Promise.resolve({
        data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectId}/cases') return Promise.resolve({ data: cases, response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/runs') return Promise.resolve({ data: runs, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderRuns() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/runs']}>
      <Routes>
        <Route path="/projects/:projectId/runs" element={<RunsPage />} />
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

  it('lists runs as links to their execution board', async () => {
    mockRunsAPI([testCase], [{ id: 'r1', projectId: 'p1', name: 'Sprint 1', createdAt: '' }])
    renderRuns()
    const runLink = await screen.findByRole('link', { name: 'Sprint 1' })
    expect(runLink).toHaveAttribute('href', '/runs/r1')
  })

  it('creates a run including all current cases', async () => {
    mockRunsAPI([testCase])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', projectId: 'p1', name: 'Sprint 2', createdAt: '' },
      response: { ok: true },
    })
    renderRuns()

    await screen.findByLabelText(/^name$/i)
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Sprint 2')
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/runs',
        expect.objectContaining({
          params: { path: { projectId: 'p1' } },
          body: { name: 'Sprint 2', caseIds: ['c1'] },
        }),
      )
    })
  })

  it('does not submit a run without a name', async () => {
    mockRunsAPI([testCase])
    renderRuns()
    await screen.findByLabelText(/^name$/i)
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('disables "Create run" until the case list has finished loading, so a fast click cannot create a run with 0 items', async () => {
    let resolveCases: (value: { data: unknown[]; response: { ok: true } }) => void
    const casesPromise = new Promise<{ data: unknown[]; response: { ok: true } }>((resolve) => {
      resolveCases = resolve
    })
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectId}')
        return Promise.resolve({
          data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectId}/cases') return casesPromise
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderRuns()

    expect(screen.getByRole('button', { name: /create run/i })).toBeDisabled()
    resolveCases!({ data: [testCase], response: { ok: true } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create run/i })).not.toBeDisabled()
    })
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
    expect(screen.getByRole('button', { name: /create run/i })).not.toBeDisabled()
  })
})
