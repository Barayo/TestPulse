import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import RunsPage from './RunsPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

function makeCase(key: string, id: string, title: string, folderId = 'root') {
  return {
    id,
    key,
    projectId: 'p1',
    folderId,
    currentVersion: 1,
    content: { title, description: '', steps: [], expectedResult: '', priority: 'medium', tags: [] },
    createdAt: '',
  }
}

const caseA = makeCase('p1-1', 'c1', 'Login works')
const caseB = makeCase('p1-2', 'c2', 'Checkout works')

const folders = [{ id: 'root', name: 'Library', projectId: 'p1', parentFolderId: undefined }]

const smokeSuite = { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '', passRate: null, lastRunAt: null }

function mockRunsAPI(cases: unknown[] = [], runs: unknown[] = [], suites: unknown[] = []) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({
        data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/cases') return Promise.resolve({ data: cases, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/runs') return Promise.resolve({ data: runs, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/folders') return Promise.resolve({ data: folders, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/suites') return Promise.resolve({ data: suites, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderRuns(initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries'] = ['/projects/p1/runs']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
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

  it('lists runs as links to their execution board', async () => {
    mockRunsAPI([caseA], [{ id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Sprint 1', createdAt: '' }])
    renderRuns()
    const runLink = await screen.findByRole('link', { name: 'Sprint 1' })
    expect(runLink).toHaveAttribute('href', '/runs/p1-R1')
  })

  it('starts with an empty, explicit case selection and a disabled Create run button', async () => {
    mockRunsAPI([caseA, caseB])
    renderRuns()
    await screen.findByRole('checkbox', { name: /login works/i })
    expect(screen.getByRole('checkbox', { name: /login works/i })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /create run/i })).toBeDisabled()
  })

  it('creates a run from a hand-picked case selection, not every project case', async () => {
    mockRunsAPI([caseA, caseB])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Sprint 2', createdAt: '' },
      response: { ok: true },
    })
    renderRuns()

    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Sprint 2')
    await userEvent.click(await screen.findByRole('checkbox', { name: /login works/i }))
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/runs',
        expect.objectContaining({
          params: { path: { projectKey: 'p1' } },
          body: { name: 'Sprint 2', caseKeys: ['p1-1'] },
        }),
      )
    })
  })

  it('does not submit a run without a name, even with cases selected', async () => {
    mockRunsAPI([caseA])
    renderRuns()
    await userEvent.click(await screen.findByRole('checkbox', { name: /login works/i }))
    expect(screen.getByRole('button', { name: /create run/i })).toBeDisabled()
  })

  it('selecting a suite seeds the selection with its member cases', async () => {
    mockRunsAPI([caseA, caseB], [], [smokeSuite])
    renderRuns()
    await userEvent.selectOptions(await screen.findByLabelText(/suite/i), 'p1-S1')
    expect(screen.getByRole('checkbox', { name: /login works/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /checkout works/i })).not.toBeChecked()
  })

  it('a run created with a suite selected sends suiteKey and that suite\'s cases', async () => {
    mockRunsAPI([caseA, caseB], [], [smokeSuite])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Smoke run', createdAt: '' },
      response: { ok: true },
    })
    renderRuns()
    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Smoke run')
    await userEvent.selectOptions(screen.getByLabelText(/suite/i), 'p1-S1')
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/runs',
        expect.objectContaining({
          body: { name: 'Smoke run', caseKeys: ['p1-1'], suiteKey: 'p1-S1' },
        }),
      )
    })
  })

  it('switching the suite selector back to "No suite" clears the seeded selection', async () => {
    mockRunsAPI([caseA, caseB], [], [smokeSuite])
    renderRuns()
    await userEvent.selectOptions(await screen.findByLabelText(/suite/i), 'p1-S1')
    expect(screen.getByRole('checkbox', { name: /login works/i })).toBeChecked()

    await userEvent.selectOptions(screen.getByLabelText(/suite/i), '')
    expect(screen.getByRole('checkbox', { name: /login works/i })).not.toBeChecked()
  })

  it('a run created with no suite selected is ad hoc (no suiteKey sent)', async () => {
    mockRunsAPI([caseA])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Ad hoc run', createdAt: '' },
      response: { ok: true },
    })
    renderRuns()
    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Ad hoc run')
    await userEvent.click(await screen.findByRole('checkbox', { name: /login works/i }))
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/runs',
        expect.objectContaining({ body: { name: 'Ad hoc run', caseKeys: ['p1-1'] } }),
      )
    })
  })

  it('deep-link route state from a suite\'s "Run suite" action seeds the selection and name', async () => {
    mockRunsAPI([caseA, caseB], [], [smokeSuite])
    renderRuns([
      { pathname: '/projects/p1/runs', state: { seedFromSuiteKey: 'p1-S1', seedName: 'Smoke run' } },
    ])
    // The suite-seeding effect commits one render after the case rows first
    // appear (cases load → rows render unchecked; the effect then seeds the
    // selection), so the checked state must be awaited, not just the row's
    // existence — findByRole alone can resolve on that earlier, unchecked render.
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /login works/i })).toBeChecked()
    })
    expect(screen.getByRole('checkbox', { name: /checkout works/i })).not.toBeChecked()
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Smoke run')
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
    expect(screen.queryByRole('button', { name: /create run/i })).not.toBeInTheDocument()
  })
})
