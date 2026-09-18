import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ProjectPage from './ProjectPage'
import { api } from '@/lib/api'
import { DataRevisionProvider } from '@/lib/DataRevision'
import { AuthProvider } from '@/lib/useAuth'
import { ProjectSwitcherProvider } from '@/lib/useProjectSwitcher'
import type { SwitcherProject } from '@/components/ProjectSwitcher'

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

const authenticatedUser = { id: 'admin1', email: 'admin@example.com', isTenantAdmin: true }

// A Tenant Admin always passes requirePermission's bypass server-side
// regardless of membership, so /permissions always succeeds for them in
// practice — this default mirrors that for the mock, and matters now
// that useProjectReadAccess (design.md D11) reads the same endpoint to
// decide the dual-mode branch, not just optional UI-control gating.
const fullPermissions = {
  read: true,
  caseCreate: true,
  caseEdit: true,
  caseDelete: true,
  sectionCreate: true,
  sectionDelete: true,
  suiteCreate: true,
  suiteEditMembership: true,
  runCreate: true,
  runRecordResult: true,
  manageProject: true,
}

// anonymous: true simulates no session — reads from /api/v1/public/...
// instead (unify-authenticated-and-public-views tasks.md 10.1). The
// authenticated-only /api/v1/projects, /api/v1/projects/summaries, and
// /permissions endpoints are never given anonymous branches (no public
// equivalent exists / is needed — see design.md D2 note on
// useProjectSummaries and D4 on useProjectPermissions); anonymous requests
// simply fall through to the default `[]` stub below, same as every other
// migrated page's test file.
function mockProjectAPI(overrides: Partial<Record<string, unknown>> = {}, anonymous = false) {
  const projectPath = anonymous ? '/api/v1/public/projects/{projectKey}' : '/api/v1/projects/{projectKey}'
  const foldersPath = anonymous ? '/api/v1/public/projects/{projectKey}/folders' : '/api/v1/projects/{projectKey}/folders'
  const casesPath = anonymous ? '/api/v1/public/projects/{projectKey}/cases' : '/api/v1/projects/{projectKey}/cases'
  const suitesPath = anonymous ? '/api/v1/public/projects/{projectKey}/suites' : '/api/v1/projects/{projectKey}/suites'
  const runsPath = anonymous ? '/api/v1/public/projects/{projectKey}/runs' : '/api/v1/projects/{projectKey}/runs'
  const runSummaryPath = anonymous ? '/api/v1/public/runs/{runKey}/summary' : '/api/v1/runs/{runKey}/summary'
  const statusSummaryPath = anonymous
    ? '/api/v1/public/projects/{projectKey}/runs/status-summary'
    : '/api/v1/projects/{projectKey}/runs/status-summary'
  const flakyCasesPath = anonymous ? '/api/v1/public/projects/{projectKey}/flaky-cases' : '/api/v1/projects/{projectKey}/flaky-cases'
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me')
      return anonymous
        ? Promise.resolve({ data: undefined, response: { ok: false } })
        : Promise.resolve({ data: overrides.me ?? authenticatedUser, response: { ok: true } })
    if (path === projectPath)
      return Promise.resolve({
        data: overrides.project ?? { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, description: '', createdAt: '' },
        response: { ok: true },
      })
    if (!anonymous && path === '/api/v1/projects')
      return Promise.resolve({
        data: overrides.projects ?? [{ id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' }],
        response: { ok: true },
      })
    if (!anonymous && path === '/api/v1/projects/summaries')
      return Promise.resolve({
        data: overrides.summaries ?? [
          { projectId: 'p1', suiteCount: 1, caseCount: 1, passRate: 100, lastRunAt: '2026-01-01T00:00:00Z', isFavorite: false },
        ],
        response: { ok: true },
      })
    if (path === foldersPath)
      return Promise.resolve({ data: { items: overrides.folders ?? [rootFolder, onboarding], nextCursor: null }, response: { ok: true } })
    if (path === casesPath)
      return Promise.resolve({ data: { items: overrides.cases ?? [caseInOnboarding], nextCursor: null }, response: { ok: true } })
    if (path === suitesPath)
      return Promise.resolve({
        data: {
          items: overrides.suites ?? [
            { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '', passRate: null },
          ],
          nextCursor: null,
        },
        response: { ok: true },
      })
    if (path === runsPath)
      return Promise.resolve({
        data: {
          items: overrides.runs ?? [{ id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Sprint 1', createdAt: '2026-01-01T00:00:00Z' }],
          nextCursor: null,
        },
        response: { ok: true },
      })
    if (path === runSummaryPath)
      return Promise.resolve({
        data: overrides.runSummary ?? { runId: 'r1', total: 2, counts: { pass: 2 } },
        response: { ok: true },
      })
    if (path === statusSummaryPath)
      return Promise.resolve({
        data: overrides.statusSummary ?? { total: 8, counts: { pass: 6, failed: 2 } },
        response: { ok: true },
      })
    if (path === flakyCasesPath)
      return Promise.resolve({ data: overrides.flakyCases ?? [], response: { ok: true } })
    if (!anonymous && path === '/api/v1/projects/{projectKey}/releases')
      return Promise.resolve({ data: overrides.releases ?? [], response: { ok: true } })
    if (path === '/api/v1/releases/{releaseKey}/rollup')
      return Promise.resolve({ data: overrides.releaseRollup ?? { runCount: 0, passRate: null }, response: { ok: true } })
    if (path === '/api/v1/releases/{releaseKey}/plans')
      return Promise.resolve({ data: overrides.releasePlans ?? [], response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions' && !anonymous)
      return Promise.resolve({ data: overrides.permissions ?? fullPermissions, response: { ok: true } })
    if (path === '/api/v1/meta')
      return Promise.resolve({
        data: overrides.meta ?? { name: 'TestPulse', version: '0.0.1', defaultLandingView: 'dashboard' },
        response: { ok: true },
      })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

const defaultSwitcherProjects: SwitcherProject[] = [
  { id: 'p1', name: 'QA Platform', suiteCount: 0, caseCount: 0, passRate: null },
]

function renderWithRoutes(extraRoutes?: ReactNode, switcherProjects: SwitcherProject[] = defaultSwitcherProjects) {
  return render(
    <DataRevisionProvider>
      <MemoryRouter initialEntries={['/projects/p1']}>
        <AuthProvider>
          <ProjectSwitcherProvider projects={switcherProjects} onSelectProject={() => {}}>
            <Routes>
              <Route path="/projects/:projectKey" element={<ProjectPage />} />
              <Route path="/login" element={<p>login stub</p>} />
              {extraRoutes}
            </Routes>
          </ProjectSwitcherProvider>
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
  it('does not render a Projects breadcrumb — the top bar already provides a way back, and the page has its own heading', async () => {
    mockProjectAPI()
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
  })

  it('shows the project name as a page heading, with its key as a subtitle', async () => {
    mockProjectAPI()
    renderProject()
    expect(await screen.findByRole('heading', { name: 'QA Platform' })).toBeInTheDocument()
    expect(screen.getByText(/p1 · project overview/i)).toBeInTheDocument()
  })

  // add-data-retention design.md D5: same badge as ProjectsPage's cards.
  it('shows an "Archived" badge on the heading for an archived project', async () => {
    mockProjectAPI({ project: { id: 'p1', key: 'p1', name: 'QA Platform', archived: true, description: '', createdAt: '' } })
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('shows no Releases panel when the project has no releases (introduce-release-test-plan)', async () => {
    mockProjectAPI()
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(screen.queryByText('Releases')).not.toBeInTheDocument()
  })

  it('shows a Releases panel with rollup and plan count once the project has at least one', async () => {
    mockProjectAPI({
      releases: [{ id: 'r1', key: 'p1-REL1', projectId: 'p1', name: '2026.1', description: '', status: 'active', createdAt: '' }],
      releaseRollup: { runCount: 14, passRate: 84 },
      releasePlans: [{ id: 't1' }, { id: 't2' }],
    })
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(await screen.findByText('Releases')).toBeInTheDocument()
    expect(screen.getByText('2026.1')).toBeInTheDocument()
    expect(screen.getByText(/2 plans/)).toBeInTheDocument()
  })

  it('shows no "Archived" badge for an active project', async () => {
    mockProjectAPI()
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(screen.queryByText('Archived')).not.toBeInTheDocument()
  })

  describe('switch-project chevron on the heading', () => {
    it('shows a chevron on the heading that opens the switcher when the account has multiple projects', async () => {
      mockProjectAPI()
      renderWithRoutes(undefined, [
        { id: 'p1', name: 'QA Platform', suiteCount: 0, caseCount: 0, passRate: null },
        { id: 'p2', name: 'Other Project', suiteCount: 0, caseCount: 0, passRate: null },
      ])
      await screen.findByRole('heading', { name: 'QA Platform' })
      await userEvent.click(screen.getByRole('button', { name: /switch project/i }))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('shows no chevron on the heading with a single accessible project', async () => {
      mockProjectAPI()
      renderProject()
      await screen.findByRole('heading', { name: 'QA Platform' })
      expect(screen.queryByRole('button', { name: /switch project/i })).not.toBeInTheDocument()
    })
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

  it('shows a Settings link to a user with manageProject permission (enable-public-project-access)', async () => {
    mockProjectAPI({
      me: { id: 'u1', email: 'member@example.com', isTenantAdmin: false },
      permissions: {
        read: true, caseCreate: false, caseEdit: false, caseDelete: false, sectionCreate: false,
        sectionDelete: false, suiteCreate: false, suiteEditMembership: false, runCreate: false,
        runRecordResult: false, manageProject: true,
      },
    })
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(await screen.findByRole('link', { name: /settings/i })).toHaveAttribute('href', '/projects/p1/settings')
  })

  it('hides the Settings link without manageProject permission', async () => {
    mockProjectAPI({
      me: { id: 'u1', email: 'member@example.com', isTenantAdmin: false },
      permissions: {
        read: true, caseCreate: false, caseEdit: false, caseDelete: false, sectionCreate: false,
        sectionDelete: false, suiteCreate: false, suiteEditMembership: false, runCreate: false,
        runRecordResult: false, manageProject: false,
      },
    })
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument()
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
      renderWithRoutes(<Route path="/projects/:projectKey/library/*" element={<div>library stub</div>} />)
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
    let resolveFolders!: (v: { data: { items: unknown[]; nextCursor: null }; response: { ok: true } }) => void
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
      if (path === '/api/v1/projects/{projectKey}/cases')
        return Promise.resolve({ data: { items: [caseInOnboarding], nextCursor: null }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/suites')
        return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/runs')
        return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
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

    resolveFolders({ data: { items: [rootFolder, onboarding], nextCursor: null }, response: { ok: true } })
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
      <Route path="/projects/:projectKey/library/*" element={<div>library explorer stub</div>} />,
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

  it('shows a Reports panel below the other three, summarizing project-wide pass rate and flaky-case count', async () => {
    mockProjectAPI({
      statusSummary: { total: 8, counts: { pass: 6, failed: 2 } },
      flakyCases: [
        { caseKey: 'p1-1', caseTitle: 'Flaky one', currentVersion: 1, rate: 30 },
        { caseKey: 'p1-2', caseTitle: 'Flaky two', currentVersion: 1, rate: 40 },
      ],
    })
    renderProject()
    await screen.findByText('Reports')
    expect(await screen.findByText('75%')).toBeInTheDocument()
    expect(screen.getByText(/2 flaky/i)).toBeInTheDocument()
  })

  it('the Reports panel links to the full Reports page, not "see all N"', async () => {
    mockProjectAPI()
    renderWithRoutes(<Route path="/projects/:projectKey/reports" element={<div>reports page stub</div>} />)
    expect(await screen.findByRole('button', { name: 'Open Reports' })).toHaveTextContent(/open reports/i)
    await userEvent.click(screen.getByRole('button', { name: 'Open Reports' }))
    expect(await screen.findByText('reports page stub')).toBeInTheDocument()
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
      expect(await strip.findByText(/Sprint 1/)).toBeInTheDocument()
      expect(strip.getByText(/· 100%/)).toBeInTheDocument()
    })

    it('lays out its cells on a proportional grid, not a packed flex row that leaves a dead gap before the last cell', async () => {
      mockProjectAPI()
      renderProject()
      const strip = await screen.findByTestId('summary-strip')
      expect(strip).toHaveClass('grid')
      expect(strip).toHaveClass(
        'md:grid-cols-[minmax(200px,1.1fr)_auto_minmax(220px,1.3fr)_auto_minmax(160px,0.9fr)]',
      )
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
        <Route path="/projects/:projectKey/library/*" element={<div>library explorer stub</div>} />,
      )
      await userEvent.click(await screen.findByText('Small'))
      expect(await screen.findByText('library explorer stub')).toBeInTheDocument()
    })
  })
})

describe('Landing view redirect (add-configurable-project-landing)', () => {
  it('renders the existing dashboard unchanged when the effective view is "dashboard"', async () => {
    mockProjectAPI({
      project: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, description: '', landingView: null, createdAt: '' },
      meta: { name: 'TestPulse', version: '0.0.1', defaultLandingView: 'dashboard' },
    })
    renderProject()
    expect(await screen.findByRole('heading', { name: 'QA Platform' })).toBeInTheDocument()
  })

  it('redirects to Suites when the project has its own "suites" override', async () => {
    mockProjectAPI({
      project: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, description: '', landingView: 'suites', createdAt: '' },
      meta: { name: 'TestPulse', version: '0.0.1', defaultLandingView: 'dashboard' },
    })
    renderWithRoutes(<Route path="/projects/:projectKey/suites" element={<div>suites page stub</div>} />)
    expect(await screen.findByText('suites page stub')).toBeInTheDocument()
  })

  it('redirects to Library when the project has no override and the instance default is "library"', async () => {
    mockProjectAPI({
      project: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, description: '', landingView: null, createdAt: '' },
      meta: { name: 'TestPulse', version: '0.0.1', defaultLandingView: 'library' },
    })
    renderWithRoutes(<Route path="/projects/:projectKey/library/*" element={<div>library explorer stub</div>} />)
    expect(await screen.findByText('library explorer stub')).toBeInTheDocument()
  })
})

// Dual-mode migration (unify-authenticated-and-public-views tasks.md
// group 10).
describe('anonymous / dual-mode', () => {
  it('fetches project metadata and landing data from the public API when there is no session', async () => {
    mockProjectAPI({}, true)
    renderProject()
    await screen.findByRole('heading', { name: 'QA Platform' })
    await screen.findByText('Onboarding')
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/folders', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/cases', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/suites', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/runs', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/runs/{runKey}/summary', expect.anything())
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
  })

  it('shows the identical summary strip and Library/Suites/Runs panels an authenticated member sees, with Members/Settings and the switcher chevron absent', async () => {
    const secondCase = { ...caseInOnboarding, id: 'c2' }
    mockProjectAPI({ cases: [caseInOnboarding, secondCase] }, true)
    renderProject()
    await screen.findByText('Healthy', { selector: 'span' })
    const strip = within(screen.getByTestId('summary-strip'))
    expect(strip.getByText('1')).toBeInTheDocument()
    expect(strip.getByText('Suites')).toBeInTheDocument()
    expect(strip.getByText('2')).toBeInTheDocument()
    expect(strip.getByText('Cases')).toBeInTheDocument()
    expect(await screen.findByText('Onboarding')).toBeInTheDocument()
    expect(screen.getByText('Smoke')).toBeInTheDocument()
    expect(screen.getByText('Sprint 1')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /members/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /switch project/i })).not.toBeInTheDocument()
  })

  it('fires no request while the session check is still in flight', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return new Promise(() => {}) // never resolves
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
    renderProject()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}', expect.anything())
  })

  it('shows a "Log in" link on the not-found state for an anonymous visitor', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: undefined, response: { ok: false } })
      if (path === '/api/v1/public/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderProject()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    const loginLink = screen.getByRole('link', { name: /log in/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })
})

// design.md D11: a signed-in user with no membership on a public
// project gets 403 from every authenticated route (including
// /permissions, which useProjectReadAccess itself checks) — the page
// must fall back to the public branch instead of showing "not found",
// exactly like an anonymous visitor would see.
describe('signed-in non-member (design.md D11)', () => {
  it('falls back to the public API and renders the project instead of "not found"', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me')
        return Promise.resolve({ data: { id: 'u1', email: 'member@example.com', isTenantAdmin: false }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/permissions')
        return Promise.resolve({ data: undefined, response: { ok: false } })
      if (path === '/api/v1/public/projects/{projectKey}')
        return Promise.resolve({
          data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/public/projects/{projectKey}/folders')
        return Promise.resolve({ data: { items: [rootFolder, onboarding], nextCursor: null }, response: { ok: true } })
      if (path === '/api/v1/public/projects/{projectKey}/cases')
        return Promise.resolve({ data: { items: [caseInOnboarding], nextCursor: null }, response: { ok: true } })
      if (path === '/api/v1/public/projects/{projectKey}/suites')
        return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
      if (path === '/api/v1/public/projects/{projectKey}/runs')
        return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderProject()
    expect(await screen.findByRole('heading', { name: 'QA Platform' })).toBeInTheDocument()
    expect(screen.queryByText(/project not found/i)).not.toBeInTheDocument()
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
  })

  // The fallback's failure mode: a signed-in non-member on a project that
  // is genuinely private (never public) must still see "not found" — the
  // public-branch retry fails exactly like it would for an anonymous
  // visitor, not silently granted access some other way.
  it('shows "not found" for a signed-in non-member on a private project, the same as an anonymous visitor', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me')
        return Promise.resolve({ data: { id: 'u1', email: 'member@example.com', isTenantAdmin: false }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/permissions')
        return Promise.resolve({ data: undefined, response: { ok: false } })
      if (path === '/api/v1/public/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderProject()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    // Already signed in — must not offer a redundant "Log in" link.
    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
  })
})

// Regression check for the loading-race fix (unify-authenticated-and-public-views
// design.md D2, tasks.md 15.3): before RequireAuth stopped wrapping this
// route, its `if (loading) return null` guaranteed this page never even
// mounted until the session check resolved. Once ProjectPage resolves its
// own access (D3), a signed-in member hard-refreshing a private project's
// URL must still never see a "not found" flash during the window where
// `useAuth()`'s `loading` is still `true` — component-level here rather
// than a full E2E run, since it exercises exactly the same race the unit
// tests above already prove `load()` waits on, just asserted end-to-end
// through a real render.
describe('loading-race regression (D2)', () => {
  it('never shows "Project not found" while the session check is still resolving, for a project the caller can actually read', async () => {
    let resolveMe!: (v: { data: unknown; response: { ok: boolean } }) => void
    const mePromise = new Promise((resolve) => {
      resolveMe = resolve
    })
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return mePromise
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({
          data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, description: '', createdAt: '' },
          response: { ok: true },
        })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderProject()

    // Still resolving — must not have jumped to "not found" in the meantime.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText(/project not found/i)).not.toBeInTheDocument()

    resolveMe({ data: authenticatedUser, response: { ok: true } })
    expect(await screen.findByRole('heading', { name: 'QA Platform' })).toBeInTheDocument()
    expect(screen.queryByText(/project not found/i)).not.toBeInTheDocument()
  })
})
