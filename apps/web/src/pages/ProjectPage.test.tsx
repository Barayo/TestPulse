import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ProjectPage from './ProjectPage'
import { api } from '@/lib/api'
import { DataRevisionProvider } from '@/lib/DataRevision'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

const rootFolder = { id: 'root', projectId: 'p1', name: 'Root', createdAt: '' }
const onboarding = { id: 'f1', projectId: 'p1', parentFolderId: 'root', name: 'Onboarding', createdAt: '' }

const caseInOnboarding = {
  id: 'c1',
  key: 'p1-1',
  projectId: 'p1',
  folderId: 'f1',
  currentVersion: 1,
  content: { title: 'Login works', description: '', steps: [], expectedResult: '', priority: 'medium', tags: [] },
  createdAt: '',
}

function mockProjectAPI(overrides: Partial<Record<string, unknown>> = {}) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me')
      return Promise.resolve({
        data: overrides.me ?? { id: 'admin1', email: 'admin@example.com', isTenantAdmin: true },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({
        data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === '/api/v1/projects')
      return Promise.resolve({
        data: overrides.projects ?? [{ id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' }],
        response: { ok: true },
      })
    if (path === '/api/v1/projects/summaries')
      return Promise.resolve({
        data: overrides.summaries ?? [
          { projectId: 'p1', suiteCount: 1, caseCount: 1, passRate: 100, lastRunAt: '2026-01-01T00:00:00Z', isFavorite: false },
        ],
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/folders')
      return Promise.resolve({ data: overrides.folders ?? [rootFolder, onboarding], response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/cases')
      return Promise.resolve({ data: overrides.cases ?? [caseInOnboarding], response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/suites')
      return Promise.resolve({
        data: overrides.suites ?? [
          { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '', passRate: null },
        ],
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/runs')
      return Promise.resolve({
        data: overrides.runs ?? [{ id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Sprint 1', createdAt: '2026-01-01T00:00:00Z' }],
        response: { ok: true },
      })
    if (path === '/api/v1/runs/{runKey}/summary')
      return Promise.resolve({
        data: overrides.runSummary ?? { runId: 'r1', total: 2, counts: { pass: 2 } },
        response: { ok: true },
      })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderWithRoutes(extraRoutes?: ReactNode) {
  return render(
    <DataRevisionProvider>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <AuthProvider>
          <Routes>
            <Route path="/projects/:projectKey" element={<ProjectPage />} />
            {extraRoutes}
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </DataRevisionProvider>,
  )
}

function renderProject() {
  return renderWithRoutes()
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

  it('shows the project name as a page heading, with its key as a subtitle', async () => {
    mockProjectAPI()
    renderProject()
    expect(await screen.findByRole('heading', { name: 'QA Platform' })).toBeInTheDocument()
    expect(screen.getByText(/p1 · project overview/i)).toBeInTheDocument()
  })

  it('shows a Members link to a Tenant Admin (add-project-rbac — the only way to assign roles on a project)', async () => {
    mockProjectAPI()
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(screen.getByRole('link', { name: /members/i })).toHaveAttribute('href', '/projects/p1/members')
  })

  it('hides the Members link from a non-Tenant-Admin', async () => {
    mockProjectAPI({ me: { id: 'u1', email: 'member@example.com', isTenantAdmin: false } })
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(screen.queryByRole('link', { name: /members/i })).not.toBeInTheDocument()
  })

  it('shows the top-level folder with its total case count', async () => {
    mockProjectAPI()
    renderProject()
    const folderName = await screen.findByText('Onboarding')
    const row = folderName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('1 case')).toBeInTheDocument()
  })

  describe('root-level (unsectioned) cases', () => {
    it('shows an "Unsectioned" row in the Library panel for cases living directly in the root section', async () => {
      const rootCase = { ...caseInOnboarding, id: 'c2', folderId: 'root' }
      mockProjectAPI({ cases: [caseInOnboarding, rootCase] })
      renderProject()
      const row = (await screen.findByText('Unsectioned')).closest('li')
      expect(row).not.toBeNull()
      expect(within(row as HTMLElement).getByText('1 case')).toBeInTheDocument()
    })

    it('navigates to the root section when the Unsectioned row is clicked', async () => {
      const rootCase = { ...caseInOnboarding, id: 'c2', folderId: 'root' }
      mockProjectAPI({ cases: [caseInOnboarding, rootCase] })
      renderWithRoutes(<Route path="/projects/:projectKey/library/:folderId" element={<div>library stub</div>} />)
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

  it('shows suites with their case count and pass-rate health bar', async () => {
    mockProjectAPI({
      suites: [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '', passRate: 90 }],
    })
    renderProject()
    const suiteName = await screen.findByText('Smoke')
    const row = suiteName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('1 case')).toBeInTheDocument()
    expect(within(row as HTMLElement).getByText('90%')).toBeInTheDocument()
  })

  it('shows "Never run" for a suite with no pass rate, instead of a fake 0%', async () => {
    mockProjectAPI({
      suites: [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null }],
    })
    renderProject()
    const suiteName = await screen.findByText('Smoke')
    const row = suiteName.closest('li')
    expect(within(row as HTMLElement).getByText(/never run/i)).toBeInTheDocument()
  })

  it('shows recent runs with their pass rate', async () => {
    mockProjectAPI()
    renderProject()
    const runName = await screen.findByText('Sprint 1')
    const row = runName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('100%')).toBeInTheDocument()
  })

  it('shows the pass/fail fraction on a Recent runs row', async () => {
    mockProjectAPI({
      runs: [{ id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Sprint 1', createdAt: '2026-01-01T00:00:00Z' }],
      runSummary: { runId: 'r1', total: 10, counts: { pass: 3 } },
    })
    renderProject()
    const runName = await screen.findByText('Sprint 1')
    const row = runName.closest('li')
    expect(within(row as HTMLElement).getByText('3/10 passed')).toBeInTheDocument()
  })

  it('color-codes a Recent runs row by its pass-rate band, not just the printed percentage', async () => {
    mockProjectAPI({
      runs: [{ id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Risky run', createdAt: '2026-01-01T00:00:00Z' }],
      runSummary: { runId: 'r1', total: 10, counts: { pass: 3 } },
    })
    renderProject()
    const runName = await screen.findByText('Risky run')
    const row = runName.closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('30%')).toBeInTheDocument()
    expect(row).toHaveClass('border-l-destructive')
  })

  it('does not flash the get-started checklist before landing data has loaded, for a project that turns out to have real content', async () => {
    let resolveFolders!: (v: { data: unknown[]; response: { ok: true } }) => void
    const foldersPromise = new Promise((resolve) => {
      resolveFolders = resolve
    })
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me')
        return Promise.resolve({ data: { id: 'admin1', email: 'admin@example.com', isTenantAdmin: true }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' }, response: { ok: true } })
      if (path === '/api/v1/projects/summaries') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/folders') return foldersPromise
      if (path === '/api/v1/projects/{projectKey}/cases') return Promise.resolve({ data: [caseInOnboarding], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/suites') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/runs') return Promise.resolve({ data: [], response: { ok: true } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderProject()

    // `project` has resolved but the landing fetch (folders/cases/suites/
    // runs) is still in flight, so `landing` is still sitting at its
    // all-zero default. The page must not jump to the get-started checklist
    // during this window — this project will turn out to have real content
    // (a root folder with cases) once landing loads, and flashing the
    // checklist first would be actively misleading, not just cosmetic.
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(screen.queryByText(/get started/i)).not.toBeInTheDocument()

    resolveFolders({ data: [rootFolder, onboarding], response: { ok: true } })
    expect(await screen.findByText('Onboarding')).toBeInTheDocument()
    expect(screen.queryByText(/get started/i)).not.toBeInTheDocument()
  })

  it('shows a getting-started checklist instead of three empty panels when the project has nothing at all', async () => {
    mockProjectAPI({ folders: [rootFolder], cases: [], suites: [], runs: [] })
    renderProject()
    expect(await screen.findByText(/get started/i)).toBeInTheDocument()
    expect(screen.queryByText(/no sections yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no suites yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no runs yet/i)).not.toBeInTheDocument()
  })

  it('uses the Test Case icon on the "Add your first test case" step, not the Section icon', async () => {
    mockProjectAPI({ folders: [rootFolder], cases: [], suites: [], runs: [] })
    const { container } = renderProject()
    await screen.findByText(/get started/i)
    const step = screen.getByText(/add your first test case/i).closest('button') ?? container
    // Test Case's established icon everywhere else (ProjectLandingPanels, RolesPage)
    // is FileTextIcon, not FolderIcon (that's Section's icon) — fix-entity-icon-consistency.
    expect(step.querySelector('.lucide-file-text')).toBeInTheDocument()
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
    renderWithRoutes(
      <Route path="/projects/:projectKey/library/:folderId" element={<div>library explorer stub</div>} />,
    )
    await userEvent.click(await screen.findByText('Onboarding'))
    expect(await screen.findByText('library explorer stub')).toBeInTheDocument()
  })

  it('navigates to the full library/suites/runs pages via each panel\'s "see all" link', async () => {
    mockProjectAPI()
    renderWithRoutes(
      <>
        <Route path="/projects/:projectKey/library" element={<div>library page stub</div>} />
        <Route path="/projects/:projectKey/suites" element={<div>suites page stub</div>} />
        <Route path="/projects/:projectKey/runs" element={<div>runs page stub</div>} />
      </>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Go to Library' }))
    expect(await screen.findByText('library page stub')).toBeInTheDocument()
  })

  it('navigates to the suites page via its "see all" link', async () => {
    mockProjectAPI()
    renderWithRoutes(<Route path="/projects/:projectKey/suites" element={<div>suites page stub</div>} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Go to Suites' }))
    expect(await screen.findByText('suites page stub')).toBeInTheDocument()
  })

  it('navigates to the runs page via its "see all" link', async () => {
    mockProjectAPI()
    renderWithRoutes(<Route path="/projects/:projectKey/runs" element={<div>runs page stub</div>} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Go to Runs' }))
    expect(await screen.findByText('runs page stub')).toBeInTheDocument()
  })

  it('navigates directly to a suite when its row is clicked', async () => {
    mockProjectAPI()
    renderWithRoutes(<Route path="/projects/:projectKey/suites/:suiteKey" element={<div>suite detail page stub</div>} />)
    await userEvent.click(await screen.findByText('Smoke'))
    expect(await screen.findByText('suite detail page stub')).toBeInTheDocument()
  })

  it('navigates directly to a run when its row is clicked', async () => {
    mockProjectAPI()
    renderWithRoutes(<Route path="/runs/:runKey" element={<div>run page stub</div>} />)
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

  it('shows a not-found message instead of an empty, interactive project when the project does not exist or is not accessible', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me')
        return Promise.resolve({ data: { id: 'admin1', email: 'admin@example.com', isTenantAdmin: true }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderProject()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /go to library/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/get started/i)).not.toBeInTheDocument()
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
    expect(within(row as HTMLElement).getByText('2 cases')).toBeInTheDocument()
  })

  describe('summary strip', () => {
    it("shows the project's health ring, status pill, and suite/case counts", async () => {
      mockProjectAPI({
        summaries: [
          { projectId: 'p1', suiteCount: 7, caseCount: 70, passRate: 84, lastRunAt: '2026-01-01T00:00:00Z', isFavorite: false },
        ],
      })
      renderProject()
      await screen.findByText('Healthy', { selector: 'span' })
      const strip = within(screen.getByTestId('summary-strip'))
      expect(screen.getByTestId('health-ring')).toHaveTextContent('84%')
      expect(strip.getByText('7')).toBeInTheDocument()
      expect(strip.getByText('Suites')).toBeInTheDocument()
      expect(strip.getByText('70')).toBeInTheDocument()
      expect(strip.getByText('Cases')).toBeInTheDocument()
    })

    it('shows "No runs yet" in the summary strip instead of a pass rate when the project has never run', async () => {
      mockProjectAPI({
        summaries: [{ projectId: 'p1', suiteCount: 0, caseCount: 0, passRate: null, lastRunAt: null, isFavorite: false }],
      })
      renderProject()
      expect(await screen.findByText('No runs yet', { selector: 'span' })).toBeInTheDocument()
    })

    it('shows the last run\'s time, name, and pass rate', async () => {
      mockProjectAPI({
        summaries: [
          { projectId: 'p1', suiteCount: 1, caseCount: 1, passRate: 100, lastRunAt: '2026-01-01T00:00:00Z', isFavorite: false },
        ],
        runs: [{ id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Sprint 1', createdAt: '2026-01-01T00:00:00Z' }],
      })
      renderProject()
      await screen.findByText('Last run')
      const strip = within(screen.getByTestId('summary-strip'))
      expect(strip.getByText(/Sprint 1/)).toBeInTheDocument()
      expect(strip.getByText(/· 100%/)).toBeInTheDocument()
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
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('30')).toBeInTheDocument()
      expect(screen.queryByText('99')).not.toBeInTheDocument()
    })
  })

  it('shows the most recently created run first', async () => {
    mockProjectAPI({
      runs: [
        { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Older run', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Newer run', createdAt: '2026-02-01T00:00:00Z' },
      ],
    })
    renderProject()
    const runNames = await screen.findAllByText(/(Older|Newer) run/)
    expect(runNames[0]).toHaveTextContent('Newer run')
  })

  describe('Library panel enrichment', () => {
    const big = { id: 'fBig', projectId: 'p1', parentFolderId: 'root', name: 'Big', createdAt: '' }
    const small = { id: 'fSmall', projectId: 'p1', parentFolderId: 'root', name: 'Small', createdAt: '' }
    const empty = { id: 'fEmpty', projectId: 'p1', parentFolderId: 'root', name: 'Empty', createdAt: '' }
    const parent = { id: 'fParent', projectId: 'p1', parentFolderId: 'root', name: 'Parent', createdAt: '' }
    const childA = { id: 'fChildA', projectId: 'p1', parentFolderId: 'fParent', name: 'Child A', createdAt: '' }
    const childB = { id: 'fChildB', projectId: 'p1', parentFolderId: 'fParent', name: 'Child B', createdAt: '' }

    function makeCases(folderId: string, count: number) {
      return Array.from({ length: count }, (_, i) => ({ ...caseInOnboarding, id: `${folderId}-c${i}`, folderId }))
    }

    it('sizes the magnitude bar relative to the panel\'s largest section', async () => {
      mockProjectAPI({
        folders: [rootFolder, big, small],
        cases: [...makeCases('fBig', 8), ...makeCases('fSmall', 4)],
      })
      renderProject()
      const bigRow = (await screen.findByText('Big')).closest('li') as HTMLElement
      const smallRow = (await screen.findByText('Small')).closest('li') as HTMLElement
      const bigFill = bigRow.querySelector('[data-fill]') as HTMLElement
      const smallFill = smallRow.querySelector('[data-fill]') as HTMLElement
      expect(bigFill.style.width).toBe('100%')
      expect(smallFill.style.width).toBe('50%')
    })

    it('shows an empty section with a dashed/italic treatment and no magnitude bar', async () => {
      mockProjectAPI({ folders: [rootFolder, empty], cases: [] })
      renderProject()
      const row = (await screen.findByText('Empty')).closest('li') as HTMLElement
      expect(row.querySelector('.italic')).not.toBeNull()
      expect(row.querySelector('[data-fill]')).toBeNull()
      expect(within(row).getByText(/no cases yet/i)).toBeInTheDocument()
    })

    it('expands a section with subsections to preview its immediate children, without navigating away', async () => {
      mockProjectAPI({
        folders: [rootFolder, parent, childA, childB],
        cases: [...makeCases('fChildA', 2), ...makeCases('fChildB', 3)],
      })
      renderWithRoutes(<Route path="/projects/:projectKey/library" element={<div>library page stub</div>} />)
      const parentRow = await screen.findByText('Parent')
      expect(screen.queryByText('Child A')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /expand parent/i }))
      expect(await screen.findByText('Child A')).toBeInTheDocument()
      expect(screen.getByText('Child B')).toBeInTheDocument()
      // Expanding is a preview, not navigation.
      expect(screen.queryByText('library page stub')).not.toBeInTheDocument()

      // Clicking the row itself (not just the caret) also toggles.
      await userEvent.click(parentRow)
      expect(screen.queryByText('Child A')).not.toBeInTheDocument()
    })

    it('clicking a section with no subsections still navigates to it, unaffected by the expand behavior', async () => {
      mockProjectAPI({ folders: [rootFolder, small], cases: makeCases('fSmall', 2) })
      renderWithRoutes(
        <Route path="/projects/:projectKey/library/:folderId" element={<div>library explorer stub</div>} />,
      )
      await userEvent.click(await screen.findByText('Small'))
      expect(await screen.findByText('library explorer stub')).toBeInTheDocument()
    })
  })
})
