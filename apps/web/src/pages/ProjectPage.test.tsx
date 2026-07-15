import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProjectPage from './ProjectPage'
import { api } from '@/lib/api'
import { DataRevisionProvider } from '@/lib/DataRevision'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

const rootFolder = { id: 'root', projectId: 'p1', name: 'Root', createdAt: '' }
const onboarding = { id: 'f1', projectId: 'p1', parentFolderId: 'root', name: 'Onboarding', createdAt: '' }

const caseInOnboarding = {
  id: 'c1',
  projectId: 'p1',
  folderId: 'f1',
  currentVersion: 1,
  content: { title: 'Login works', description: '', steps: [], expectedResult: '', priority: 'medium', tags: [] },
  createdAt: '',
}

function mockProjectAPI(overrides: Partial<Record<string, unknown>> = {}) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectId}')
      return Promise.resolve({
        data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === '/api/v1/projects')
      return Promise.resolve({
        data: overrides.projects ?? [{ id: 'p1', name: 'QA Platform', archived: false, createdAt: '' }],
        response: { ok: true },
      })
    if (path === '/api/v1/projects/summaries')
      return Promise.resolve({
        data: overrides.summaries ?? [
          { projectId: 'p1', suiteCount: 1, caseCount: 1, passRate: 100, lastRunAt: '2026-01-01T00:00:00Z', isFavorite: false },
        ],
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectId}/folders')
      return Promise.resolve({ data: overrides.folders ?? [rootFolder, onboarding], response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/cases')
      return Promise.resolve({ data: overrides.cases ?? [caseInOnboarding], response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/suites')
      return Promise.resolve({
        data: overrides.suites ?? [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectId}/runs')
      return Promise.resolve({
        data: overrides.runs ?? [{ id: 'r1', projectId: 'p1', name: 'Sprint 1', createdAt: '2026-01-01T00:00:00Z' }],
        response: { ok: true },
      })
    if (path === '/api/v1/runs/{runId}/summary')
      return Promise.resolve({
        data: overrides.runSummary ?? { runId: 'r1', total: 2, counts: { pass: 2 } },
        response: { ok: true },
      })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderProject() {
  return render(
    <DataRevisionProvider>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>
    </DataRevisionProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ProjectPage landing', () => {
  it('shows a breadcrumb with a link back to Projects and the project name', async () => {
    mockProjectAPI()
    renderProject()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/')
    expect(await within(nav).findByText('QA Platform')).toBeInTheDocument()
  })

  it('shows the top-level folder with its total case count', async () => {
    mockProjectAPI()
    renderProject()
    const folderName = await screen.findByText('Onboarding')
    const row = folderName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('1')).toBeInTheDocument()
  })

  describe('root-level (unsectioned) cases', () => {
    it('shows an "Unsectioned" row in the Library panel for cases living directly in the root section', async () => {
      const rootCase = { ...caseInOnboarding, id: 'c2', folderId: 'root' }
      mockProjectAPI({ cases: [caseInOnboarding, rootCase] })
      renderProject()
      const row = (await screen.findByText('Unsectioned')).closest('li')
      expect(row).not.toBeNull()
      expect(within(row as HTMLElement).getByText('1')).toBeInTheDocument()
    })

    it('navigates to the root section when the Unsectioned row is clicked', async () => {
      const rootCase = { ...caseInOnboarding, id: 'c2', folderId: 'root' }
      mockProjectAPI({ cases: [caseInOnboarding, rootCase] })
      render(
        <DataRevisionProvider>
          <MemoryRouter initialEntries={['/projects/p1']}>
            <Routes>
              <Route path="/projects/:projectId" element={<ProjectPage />} />
              <Route path="/projects/:projectId/library/:folderId" element={<div>library stub</div>} />
            </Routes>
          </MemoryRouter>
        </DataRevisionProvider>,
      )
      await userEvent.click(await screen.findByText('Unsectioned'))
      expect(await screen.findByText('library stub')).toBeInTheDocument()
    })

    it('omits the Unsectioned row when the project has no cases directly in root', async () => {
      mockProjectAPI()
      renderProject()
      await screen.findByText('Onboarding')
      expect(screen.queryByText('Unsectioned')).not.toBeInTheDocument()
    })
  })

  it('shows suites with their case count, no pass rate', async () => {
    mockProjectAPI()
    renderProject()
    expect(await screen.findByText('Smoke')).toBeInTheDocument()
  })

  it('shows recent runs with their pass rate', async () => {
    mockProjectAPI()
    renderProject()
    expect(await screen.findByText('Sprint 1')).toBeInTheDocument()
    expect(await screen.findByText(/100%/)).toBeInTheDocument()
  })

  it('color-codes a Recent runs row by its pass-rate band, not just the printed percentage', async () => {
    mockProjectAPI({
      runs: [{ id: 'r1', projectId: 'p1', name: 'Risky run', createdAt: '2026-01-01T00:00:00Z' }],
      runSummary: { runId: 'r1', total: 10, counts: { pass: 3 } },
    })
    renderProject()
    const runName = await screen.findByText('Risky run')
    const row = runName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText(/30%/)).toBeInTheDocument()
    expect(row).toHaveClass('border-l-destructive')
  })

  it('shows a getting-started checklist instead of three empty panels when the project has nothing at all', async () => {
    mockProjectAPI({ folders: [rootFolder], cases: [], suites: [], runs: [] })
    renderProject()
    expect(await screen.findByText(/get started/i)).toBeInTheDocument()
    expect(screen.queryByText(/no sections yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no suites yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no runs yet/i)).not.toBeInTheDocument()
  })

  it('gives each getting-started step a short explanatory tip, not just a bare label', async () => {
    mockProjectAPI({ folders: [rootFolder], cases: [], suites: [], runs: [] })
    renderProject()
    await screen.findByText(/get started/i)
    expect(screen.getByText(/describe the steps/i)).toBeInTheDocument()
    expect(screen.getByText(/independent of how cases are organized/i)).toBeInTheDocument()
    expect(screen.getByText(/pass or fail/i)).toBeInTheDocument()
  })

  it('shows the normal per-panel empty states when the project has some content but not everything yet', async () => {
    mockProjectAPI({ suites: [], runs: [] })
    renderProject()
    expect(await screen.findByText('Onboarding')).toBeInTheDocument()
    expect(screen.queryByText(/get started/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no suites yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
  })

  it('navigates to the library route when a section row is clicked', async () => {
    mockProjectAPI()
    render(
      <DataRevisionProvider>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/library/:folderId" element={<div>library explorer stub</div>} />
        </Routes>
      </MemoryRouter>
      </DataRevisionProvider>,
    )
    await userEvent.click(await screen.findByText('Onboarding'))
    expect(await screen.findByText('library explorer stub')).toBeInTheDocument()
  })

  it('navigates to the full library/suites/runs pages via each panel\'s "see all" link', async () => {
    mockProjectAPI()
    render(
      <DataRevisionProvider>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/library" element={<div>library page stub</div>} />
          <Route path="/projects/:projectId/suites" element={<div>suites page stub</div>} />
          <Route path="/projects/:projectId/runs" element={<div>runs page stub</div>} />
        </Routes>
      </MemoryRouter>
      </DataRevisionProvider>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Go to Library' }))
    expect(await screen.findByText('library page stub')).toBeInTheDocument()
  })

  it('navigates to the suites page via its "see all" link', async () => {
    mockProjectAPI()
    render(
      <DataRevisionProvider>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/suites" element={<div>suites page stub</div>} />
        </Routes>
      </MemoryRouter>
      </DataRevisionProvider>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Go to Suites' }))
    expect(await screen.findByText('suites page stub')).toBeInTheDocument()
  })

  it('navigates to the runs page via its "see all" link', async () => {
    mockProjectAPI()
    render(
      <DataRevisionProvider>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/runs" element={<div>runs page stub</div>} />
        </Routes>
      </MemoryRouter>
      </DataRevisionProvider>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Go to Runs' }))
    expect(await screen.findByText('runs page stub')).toBeInTheDocument()
  })

  it('navigates directly to a suite when its row is clicked', async () => {
    mockProjectAPI()
    render(
      <DataRevisionProvider>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/suites" element={<div>suites page stub</div>} />
        </Routes>
      </MemoryRouter>
      </DataRevisionProvider>,
    )
    await userEvent.click(await screen.findByText('Smoke'))
    expect(await screen.findByText('suites page stub')).toBeInTheDocument()
  })

  it('navigates directly to a run when its row is clicked', async () => {
    mockProjectAPI()
    render(
      <DataRevisionProvider>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/runs/:runId" element={<div>run page stub</div>} />
        </Routes>
      </MemoryRouter>
      </DataRevisionProvider>,
    )
    await userEvent.click(await screen.findByText('Sprint 1'))
    expect(await screen.findByText('run page stub')).toBeInTheDocument()
  })

  it('recovers gracefully when the project fetch fails', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    renderProject()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(await screen.findByText(/no sections yet/i)).toBeInTheDocument()
  })

  it('counts cases from a grandchild folder toward its top-level ancestor', async () => {
    const grandchild = { id: 'f2', projectId: 'p1', parentFolderId: 'f1', name: 'Nested', createdAt: '' }
    const caseInGrandchild = { ...caseInOnboarding, id: 'c2', folderId: 'f2' }
    mockProjectAPI({
      folders: [rootFolder, onboarding, grandchild],
      cases: [caseInOnboarding, caseInGrandchild],
    })
    renderProject()
    const folderName = await screen.findByText('Onboarding')
    const row = folderName.closest('li')
    expect(within(row as HTMLElement).getByText('2')).toBeInTheDocument()
  })

  describe('summary strip', () => {
    it("shows the project's status pill, pass-rate bar, and suite/case totals", async () => {
      mockProjectAPI({
        summaries: [
          { projectId: 'p1', suiteCount: 7, caseCount: 70, passRate: 84, lastRunAt: '2026-01-01T00:00:00Z', isFavorite: false },
        ],
      })
      renderProject()
      expect(await screen.findByText('Healthy', { selector: 'span' })).toBeInTheDocument()
      expect(screen.getByText('7 suites')).toBeInTheDocument()
      expect(screen.getByText('70 cases')).toBeInTheDocument()
      expect(document.querySelector('[data-track]')).toBeInTheDocument()
    })

    it('shows "No runs yet" in the summary strip instead of a pass rate when the project has never run', async () => {
      mockProjectAPI({
        summaries: [{ projectId: 'p1', suiteCount: 0, caseCount: 0, passRate: null, lastRunAt: null, isFavorite: false }],
      })
      renderProject()
      expect(await screen.findByText('No runs yet', { selector: 'span' })).toBeInTheDocument()
    })

    it('reflects the active project, not just the first entry in the summaries list', async () => {
      mockProjectAPI({
        summaries: [
          { projectId: 'other', suiteCount: 99, caseCount: 99, passRate: 10, lastRunAt: null, isFavorite: false },
          { projectId: 'p1', suiteCount: 3, caseCount: 30, passRate: 84, lastRunAt: '2026-01-01T00:00:00Z', isFavorite: false },
        ],
      })
      renderProject()
      await screen.findByText('Healthy', { selector: 'span' })
      expect(screen.getByText('3 suites')).toBeInTheDocument()
      expect(screen.getByText('30 cases')).toBeInTheDocument()
      expect(screen.queryByText('99 suites')).not.toBeInTheDocument()
    })
  })

  it('shows the most recently created run first', async () => {
    mockProjectAPI({
      runs: [
        { id: 'r1', projectId: 'p1', name: 'Older run', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'r2', projectId: 'p1', name: 'Newer run', createdAt: '2026-02-01T00:00:00Z' },
      ],
    })
    renderProject()
    const runNames = await screen.findAllByText(/(Older|Newer) run/)
    expect(runNames[0]).toHaveTextContent('Newer run')
  })
})
