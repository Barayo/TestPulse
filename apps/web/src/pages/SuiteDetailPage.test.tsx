import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import SuiteDetailPage from './SuiteDetailPage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)
const mockPOST = vi.mocked(api.POST)

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

const projectQA = { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' }
const case1 = {
  id: 'c1',
  key: 'p1-1',
  projectId: 'p1',
  folderId: 'auth',
  currentVersion: 3,
  content: { title: 'Login works', description: '', steps: [], expectedResult: '', priority: 'medium', tags: ['auth'] },
  createdAt: '',
}
const case2 = {
  id: 'c2',
  key: 'p1-2',
  projectId: 'p1',
  folderId: 'checkout',
  currentVersion: 1,
  content: { title: 'Checkout works', description: '', steps: [], expectedResult: '', priority: 'high', tags: ['checkout'] },
  createdAt: '',
}
const folders = [
  { id: 'root', key: 'p1-F1', projectId: 'p1', name: 'Library', parentFolderId: undefined, createdAt: '' },
  { id: 'auth', key: 'p1-F2', projectId: 'p1', name: 'Auth', parentFolderId: 'root', createdAt: '' },
  { id: 'checkout', key: 'p1-F3', projectId: 'p1', name: 'Checkout', parentFolderId: 'root', createdAt: '' },
]
const smokeSuite = {
  id: 's1',
  key: 'p1-S1',
  projectId: 'p1',
  name: 'Smoke',
  caseIds: ['c1'],
  createdAt: '2026-01-01T00:00:00Z',
  passRate: 90,
  lastRunAt: '2026-07-25T10:00:00Z',
}

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

// read: true, everything else false — a real member's most restrictive
// possible role (add-project-rbac fully-custom roles), not `null`/no
// membership at all (design.md D11 distinguishes the two).
const noPermissions = { ...fullPermissions, ...Object.fromEntries(Object.keys(fullPermissions).map((k) => [k, false])), read: true }

const authenticatedUser = { id: 'u1', email: 'admin@example.com', isTenantAdmin: false }

// permissions: pass `null` (not `undefined` — a default parameter would
// silently override it) to simulate no permissions data at all.
// anonymous: true simulates no session (GET /api/v1/users/me fails) — the
// dual-mode branch (unify-authenticated-and-public-views tasks.md 3.1)
// then reads from /api/v1/public/... instead.
function mockDetailAPI(
  suite: unknown = smokeSuite,
  cases: unknown[] = [case1, case2],
  permissions: unknown = fullPermissions,
  anonymous = false,
  trendPoints: unknown[] = [],
  runs: unknown[] = [],
  openTrendPoints: unknown[] = trendPoints,
) {
  mockGET.mockImplementation((path: string, options?: { params?: { query?: { includeOpen?: boolean } } }) => {
    if (path === '/api/v1/users/me')
      return anonymous
        ? Promise.resolve({ data: undefined, response: { ok: false } })
        : Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    const projectPath = anonymous ? '/api/v1/public/projects/{projectKey}' : '/api/v1/projects/{projectKey}'
    const casesPath = anonymous ? '/api/v1/public/projects/{projectKey}/cases' : '/api/v1/projects/{projectKey}/cases'
    const foldersPath = anonymous ? '/api/v1/public/projects/{projectKey}/folders' : '/api/v1/projects/{projectKey}/folders'
    const suitePath = anonymous ? '/api/v1/public/suites/{suiteKey}' : '/api/v1/suites/{suiteKey}'
    const trendPath = anonymous ? '/api/v1/public/suites/{suiteKey}/trend' : '/api/v1/suites/{suiteKey}/trend'
    const runsPath = anonymous ? '/api/v1/public/projects/{projectKey}/runs' : '/api/v1/projects/{projectKey}/runs'
    if (path === projectPath) return Promise.resolve({ data: projectQA, response: { ok: true } })
    if (path === casesPath) return Promise.resolve({ data: cases, response: { ok: true } })
    if (path === foldersPath) return Promise.resolve({ data: folders, response: { ok: true } })
    if (path === suitePath) return Promise.resolve({ data: suite, response: { ok: true } })
    if (path === trendPath) {
      const points = options?.params?.query?.includeOpen ? openTrendPoints : trendPoints
      return Promise.resolve({ data: { suiteId: 's1', suiteKey: 'p1-S1', points }, response: { ok: true } })
    }
    if (path === runsPath) return Promise.resolve({ data: runs, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: permissions === null ? undefined : permissions, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/suites/p1-S1']}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/suites/:suiteKey" element={<SuiteDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function enterEdit() {
  await userEvent.click(await screen.findByRole('button', { name: /edit cases/i }))
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('SuiteDetailPage', () => {
  it('shows a single "‹ Suites" back-link breadcrumb — the header chip covers the project, the suite name is already the page heading', async () => {
    mockDetailAPI()
    renderDetail()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    const link = within(nav).getByRole('link', { name: /Suites/ })
    expect(link).toHaveAttribute('href', '/projects/p1/suites')
    expect(nav).not.toHaveTextContent('Smoke')
  })

  it('defaults to view mode: no case grid, Stability and Run history shown instead', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Smoke' })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('Stability')).toBeInTheDocument()
    expect(screen.getByText('Run history')).toBeInTheDocument()
  })

  it('editing shows the case grid pre-checked with current members', async () => {
    mockDetailAPI()
    renderDetail()
    await enterEdit()
    expect(await screen.findByRole('checkbox', { name: /login works/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /checkout works/i })).not.toBeChecked()
  })

  it('shows sidebar properties: case count, pass rate, created — no standalone "Last run" once Run history exists', async () => {
    mockDetailAPI()
    renderDetail()
    const sidebar = within(await screen.findByTestId('suite-sidebar'))
    expect(sidebar.getByText('1')).toBeInTheDocument() // case count
    expect(sidebar.getByText('90%')).toBeInTheDocument()
    expect(sidebar.queryByText(/last run/i)).not.toBeInTheDocument()
  })

  it('shows "Never run" in the sidebar pass-rate property for a suite with no runs', async () => {
    mockDetailAPI({ ...smokeSuite, passRate: null, lastRunAt: null })
    renderDetail()
    expect(await screen.findAllByText(/never run/i)).not.toHaveLength(0)
  })

  it('scopes the case grid to a section using the project\'s real folder hierarchy', async () => {
    mockDetailAPI()
    renderDetail()
    await enterEdit()

    expect(await screen.findByRole('checkbox', { name: /login works/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('treeitem', { name: /^checkout/i }))
    expect(screen.queryByRole('checkbox', { name: /login works/i })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /checkout works/i })).toBeInTheDocument()
  })

  it('commits only the net diff on save', async () => {
    mockDetailAPI()
    mockPUT.mockResolvedValue({ response: { ok: true } })
    mockDELETE.mockResolvedValue({ response: { ok: true } })
    renderDetail()
    await enterEdit()

    const saveBtn = await screen.findByRole('button', { name: /save changes/i })
    expect(saveBtn).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox', { name: /login works/i })) // uncheck existing
    await userEvent.click(screen.getByRole('checkbox', { name: /checkout works/i })) // check new
    expect(saveBtn).toBeEnabled()
    await userEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}/cases/{caseKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1', caseKey: 'p1-1' } } }),
      )
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}/cases/{caseKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1', caseKey: 'p1-2' } } }),
      )
    })
  })

  it('preserves a member case that no longer exists in the project — no DELETE call for it', async () => {
    mockDetailAPI({ ...smokeSuite, caseIds: ['c1', 'orphan-id'] })
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderDetail()
    await enterEdit()

    expect(await screen.findByRole('checkbox', { name: /login works/i })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: /checkout works/i }))
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}/cases/{caseKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1', caseKey: 'p1-2' } } }),
      )
    })
    expect(mockDELETE).not.toHaveBeenCalled()
  })

  it('"Cancel" in edit mode discards uncommitted changes and returns to view mode', async () => {
    mockDetailAPI()
    renderDetail()
    await enterEdit()

    await userEvent.click(await screen.findByRole('checkbox', { name: /checkout works/i }))
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await enterEdit()
    expect(screen.getByRole('checkbox', { name: /checkout works/i })).not.toBeChecked()
  })

  it('shows a confirmation toast naming the new run, with a link to it, after Run suite', async () => {
    mockDetailAPI()
    mockPOST.mockResolvedValue({
      data: { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Smoke run', createdAt: '' },
      response: { ok: true },
    })
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: /run suite/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create run$/i }))

    expect(await screen.findByText('Run "Smoke run" created.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /view it/i })
    expect(link).toHaveAttribute('href', '/runs/p1-R1')
  })

  // Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
  // tasks.md 2.1/2.2): a caller without the matching permission must not
  // see the write controls at all — not disabled, absent — since this page
  // will also render for anonymous visitors on a public project.
  it('hides Run suite/Rename/Delete for a caller with no permissions, and labels the entry "View cases"', async () => {
    // read: true (a real member always has it — the /permissions endpoint
    // itself requires it, design.md D11) with everything else false, not
    // `null`: a signed-in caller who can reach this page at all has
    // necessarily passed a PermRead check somewhere, so "no permissions"
    // realistically means a maximally-restrictive role, not a failed
    // permissions fetch (which design.md D11 now treats as a distinct,
    // non-member case with its own test below).
    mockDetailAPI(smokeSuite, [case1, case2], noPermissions)
    renderDetail()

    expect(await screen.findByRole('button', { name: /view cases/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit cases$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /run suite/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  it('shows only the case list read-only, with a "Done" control, for a non-editor', async () => {
    mockDetailAPI(smokeSuite, [case1, case2], { ...fullPermissions, suiteEditMembership: false })
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: /view cases/i }))
    expect(await screen.findByRole('checkbox', { name: /login works/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /login works/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('renders the suite run-breakdown trend in the Stability section', async () => {
    const points = [
      { runKey: 'p1-R1', runName: 'Run 1', createdAt: '2026-01-01T00:00:00Z', total: 4, counts: { pass: 3, failed: 1 } },
    ]
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, points)
    renderDetail()
    await screen.findByText('Stability')
    // SuiteRunBreakdownTrend's own tests cover its rendering in detail; here
    // we only need proof it's fed real data, not an always-empty placeholder.
    expect(screen.queryByTestId('suite-breakdown-placeholder')).not.toBeInTheDocument()
  })

  it('shows the trend\'s own empty state in Stability when the suite has no closed runs', async () => {
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, [])
    renderDetail()
    await screen.findByText('Stability')
    expect(screen.getByTestId('suite-breakdown-placeholder')).toBeInTheDocument()
  })

  it('defaults the Stability card to "Closed runs", showing only closed-run points', async () => {
    const points = [{ runKey: 'p1-R1', runName: 'Run 1', createdAt: '2026-01-01T00:00:00Z', total: 4, counts: { pass: 3, failed: 1 } }]
    const openPoints = [
      ...points,
      { runKey: 'p1-R2', runName: 'Run 2 (open)', createdAt: '2026-01-02T00:00:00Z', total: 5, counts: { pass: 1 }, isOpen: true },
    ]
    const runs = [
      { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Run 1', status: 'closed', suiteKey: 'p1-S1', passRate: 75, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Run 2 (open)', status: 'open', suiteKey: 'p1-S1', passRate: 20, createdAt: '2026-01-02T00:00:00Z' },
    ]
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, points, runs, openPoints)
    renderDetail()
    await screen.findByText('Stability')

    expect(screen.getByRole('button', { name: /^closed runs$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^open \+ closed$/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('suite-breakdown-bar-p1-R1')).toBeInTheDocument()
    expect(screen.queryByTestId('suite-breakdown-bar-p1-R2')).not.toBeInTheDocument()
  })

  it('switching to "Open + closed" shows every run, including still-open ones', async () => {
    const points = [{ runKey: 'p1-R1', runName: 'Run 1', createdAt: '2026-01-01T00:00:00Z', total: 4, counts: { pass: 3, failed: 1 } }]
    const openPoints = [
      ...points,
      { runKey: 'p1-R2', runName: 'Run 2 (open)', createdAt: '2026-01-02T00:00:00Z', total: 5, counts: { pass: 1 }, isOpen: true },
    ]
    const runs = [
      { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Run 1', status: 'closed', suiteKey: 'p1-S1', passRate: 75, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Run 2 (open)', status: 'open', suiteKey: 'p1-S1', passRate: 20, createdAt: '2026-01-02T00:00:00Z' },
    ]
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, points, runs, openPoints)
    renderDetail()
    await screen.findByText('Stability')

    await userEvent.click(screen.getByRole('button', { name: /^open \+ closed$/i }))
    expect(screen.getByTestId('suite-breakdown-bar-p1-R1')).toBeInTheDocument()
    expect(screen.getByTestId('suite-breakdown-bar-p1-R2')).toBeInTheDocument()
    expect(screen.getByTestId('suite-breakdown-bar-p1-R2')).toHaveAttribute('data-open', 'true')
  })

  it('each Stability view states what it counts', async () => {
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, [], [])
    renderDetail()
    await screen.findByText('Stability')
    expect(screen.getByText(/only closed runs/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^open \+ closed$/i }))
    expect(screen.getByText(/will keep moving/i)).toBeInTheDocument()
  })

  it('shows the latest closed run above the Stability toggle, unchanged by which view is selected', async () => {
    const runs = [
      { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Run 1', status: 'closed', suiteKey: 'p1-S1', passRate: 75, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Run 2 (open)', status: 'open', suiteKey: 'p1-S1', passRate: 20, createdAt: '2026-01-02T00:00:00Z' },
    ]
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, [], runs)
    renderDetail()
    await screen.findByText('Stability')

    const latestClosed = screen.getByTestId('suite-latest-closed-run')
    expect(within(latestClosed).getByText(/latest closed run/i)).toBeInTheDocument()
    expect(within(latestClosed).getByText('75%')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^open \+ closed$/i }))
    expect(within(latestClosed).getByText(/latest closed run/i)).toBeInTheDocument()
    expect(within(latestClosed).getByText('75%')).toBeInTheDocument()
  })

  it('shows an "in progress" indicator when a newer open run trails the latest closed run', async () => {
    const runs = [
      { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Run 1', status: 'closed', suiteKey: 'p1-S1', passRate: 75, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Run 2 (open)', status: 'open', suiteKey: 'p1-S1', passRate: 20, createdAt: '2026-01-02T00:00:00Z' },
    ]
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, [], runs)
    renderDetail()
    await screen.findByText('Stability')
    expect(screen.getByText(/in progress/i)).toBeInTheDocument()
  })

  it('shows no "in progress" row when there is no trailing open run', async () => {
    const runs = [
      { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Run 1', status: 'closed', suiteKey: 'p1-S1', passRate: 75, createdAt: '2026-01-01T00:00:00Z' },
    ]
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, [], runs)
    renderDetail()
    await screen.findByText('Stability')
    expect(screen.queryByText(/in progress/i)).not.toBeInTheDocument()
  })

  it('shows a placeholder for latest closed run when the suite has no closed runs at all', async () => {
    const runs = [
      { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Run 1 (open)', status: 'open', suiteKey: 'p1-S1', passRate: 20, createdAt: '2026-01-01T00:00:00Z' },
    ]
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, [], runs)
    renderDetail()
    await screen.findByText('Stability')
    expect(screen.getByText(/latest closed run/i)).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/in progress/i)).toBeInTheDocument()
  })

  it('lists the suite\'s own runs in Run history, and shows an empty state with none', async () => {
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, [], [])
    renderDetail()
    await screen.findByText('Run history')
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
  })

  it('offers an unseeded "Compare runs" link in Run history with at least two closed runs', async () => {
    const runs = [
      { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Run 1', status: 'closed', suiteKey: 'p1-S1', createdAt: '' },
      { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Run 2', status: 'closed', suiteKey: 'p1-S1', createdAt: '' },
    ]
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, [], runs)
    renderDetail()
    const link = await screen.findByRole('link', { name: /^compare runs$/i })
    expect(link).toHaveAttribute('href', '/projects/p1/runs/compare')
  })

  it('hides "Compare runs" in Run history with fewer than two closed runs', async () => {
    const runs = [{ id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Run 1', status: 'open', suiteKey: 'p1-S1', createdAt: '' }]
    mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, false, [], runs)
    renderDetail()
    await screen.findByText('Run history')
    expect(screen.queryByRole('link', { name: /^compare runs$/i })).not.toBeInTheDocument()
  })

  it('shows a not-found message for an unknown suite key', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: projectQA, response: { ok: true } })
      if (path === '/api/v1/suites/{suiteKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderDetail()
    expect(await screen.findByText(/suite not found/i)).toBeInTheDocument()
  })

  // Dual-mode migration (unify-authenticated-and-public-views tasks.md
  // group 3): renders identically for an anonymous visitor on a publicly
  // accessible project, sourced from the public read API, with zero write
  // controls — and never fires a request while the session check is still
  // in flight (design.md D2's loading-race fix).
  describe('anonymous / dual-mode', () => {
    it('fetches from the public API when there is no session', async () => {
      mockDetailAPI(smokeSuite, [case1, case2], fullPermissions, true)
      renderDetail()
      await screen.findByRole('heading', { name: 'Smoke' })
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}', expect.anything())
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/suites/{suiteKey}', expect.anything())
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/suites/{suiteKey}', expect.anything())
    })

    it('renders the identical suite detail an authenticated member sees, with zero write controls', async () => {
      // permissions: null — a real anonymous request has no session cookie,
      // so /api/v1/projects/{projectKey}/permissions (not part of the
      // public API) would fail; useProjectPermissions already resolves
      // that to undefined via its own catch branch.
      mockDetailAPI(smokeSuite, [case1, case2], null, true)
      renderDetail()
      expect(await screen.findByRole('button', { name: /view cases/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /run suite/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it('fires no request while the session check is still in flight', async () => {
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') return new Promise(() => {}) // never resolves
        return Promise.resolve({ data: undefined, response: { ok: true } })
      })
      renderDetail()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}', expect.anything())
    })
  })

  // design.md D11: a signed-in user with no membership on a public
  // project gets 403 from every authenticated route (including
  // /permissions, which useProjectReadAccess itself checks) — the page
  // must fall back to the public branch instead of showing "not found",
  // exactly like an anonymous visitor would see.
  describe('signed-in non-member (design.md D11)', () => {
    it('falls back to the public API and renders the suite instead of "not found"', async () => {
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
        if (path === '/api/v1/projects/{projectKey}/permissions')
          return Promise.resolve({ data: undefined, response: { ok: false } })
        if (path === '/api/v1/public/projects/{projectKey}') return Promise.resolve({ data: projectQA, response: { ok: true } })
        if (path === '/api/v1/public/projects/{projectKey}/cases')
          return Promise.resolve({ data: [case1, case2], response: { ok: true } })
        if (path === '/api/v1/public/projects/{projectKey}/folders')
          return Promise.resolve({ data: folders, response: { ok: true } })
        if (path === '/api/v1/public/suites/{suiteKey}') return Promise.resolve({ data: smokeSuite, response: { ok: true } })
        if (path === '/api/v1/public/suites/{suiteKey}/trend')
          return Promise.resolve({ data: { suiteId: 's1', suiteKey: 'p1-S1', points: [] }, response: { ok: true } })
        if (path === '/api/v1/public/projects/{projectKey}/runs') return Promise.resolve({ data: [], response: { ok: true } })
        return Promise.resolve({ data: undefined, response: { ok: false } })
      })
      renderDetail()
      expect(await screen.findByRole('heading', { name: 'Smoke' })).toBeInTheDocument()
      expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
    })
  })
})
