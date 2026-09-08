import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router'
import RunsPage from './RunsPage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

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

const authenticatedUser = { id: 'u1', email: 'admin@example.com', isTenantAdmin: false }

// read: true, everything else false — a real member's most restrictive
// possible role (add-project-rbac fully-custom roles), not `null`/no
// membership at all (design.md D11 distinguishes the two).
const noPermissions = { ...fullPermissions, ...Object.fromEntries(Object.keys(fullPermissions).map((k) => [k, false])), read: true }

// permissions: pass `null` (not `undefined` — a default parameter value
// would silently override it) to simulate no permissions data at all.
// anonymous: true simulates no session — reads from /api/v1/public/...
// instead (unify-authenticated-and-public-views tasks.md 8.1).
function mockRunsAPI(runs: RunFixture[] = [], permissions: unknown = fullPermissions, anonymous = false) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me')
      return anonymous
        ? Promise.resolve({ data: undefined, response: { ok: false } })
        : Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    const projectPath = anonymous ? '/api/v1/public/projects/{projectKey}' : '/api/v1/projects/{projectKey}'
    const runsPath = anonymous ? '/api/v1/public/projects/{projectKey}/runs' : '/api/v1/projects/{projectKey}/runs'
    if (path === projectPath)
      return Promise.resolve({
        data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === runsPath) return Promise.resolve({ data: { items: runs, nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions' && !anonymous)
      return Promise.resolve({ data: permissions === null ? undefined : permissions, response: { ok: true } })
    return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
  })
}

function ComparePickerProbe() {
  const { projectKey } = useParams<{ projectKey?: string }>()
  const location = useLocation()
  const state = location.state as { seedRunKey?: string } | null
  return <p data-testid="compare-picker-probe">compare {projectKey} {state ? JSON.stringify(state) : 'no-state'}</p>
}

function renderRuns() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/runs']}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/runs" element={<RunsPage />} />
          <Route path="/projects/:projectKey/runs/compare" element={<ComparePickerProbe />} />
          <Route path="/login" element={<p>login stub</p>} />
        </Routes>
      </AuthProvider>
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

  it('fetches the project\'s suites alongside the project and runs, to resolve suite names for clustering', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' })])
    renderRuns()
    await screen.findByRole('link', { name: /sprint 1/i })
    expect(mockGET).toHaveBeenCalledWith('/api/v1/projects/{projectKey}/suites', expect.anything())
  })

  it('offers a "+ New run" button linking to the dedicated creation route', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' })])
    renderRuns()
    const link = await screen.findByRole('link', { name: /\+ new run/i })
    expect(link).toHaveAttribute('href', '/projects/p1/runs/new')
  })

  it('offers an unseeded "Compare runs" button when the project has at least two closed runs', async () => {
    mockRunsAPI([run({ name: 'Release 1.0', status: 'closed' }), run({ name: 'Release 1.1', status: 'closed' })])
    renderRuns()
    await userEvent.click(await screen.findByRole('button', { name: /^compare runs$/i }))
    expect(await screen.findByTestId('compare-picker-probe')).toHaveTextContent('compare p1 no-state')
  })

  it('hides "Compare runs" with fewer than two closed runs', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' }), run({ name: 'Release 1.0', status: 'closed' })])
    renderRuns()
    await screen.findByRole('link', { name: /sprint 1/i })
    expect(screen.queryByRole('button', { name: /^compare runs$/i })).not.toBeInTheDocument()
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

  it('shows a pass-rate health ring and relative date per row (redesign-runs-list-triage-view)', async () => {
    mockRunsAPI([
      run({ name: 'Nightly', status: 'open', passRate: 75, createdAt: new Date(Date.now() - 3600_000).toISOString() }),
      run({ name: 'Never run', status: 'open', passRate: null }),
    ])
    renderRuns()
    await screen.findByRole('link', { name: /nightly/i })
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText(/1 hour ago/i)).toBeInTheDocument()
    // A null pass rate sorts first (design.md D1) and reuses StatusPill's
    // existing "No runs yet" label rather than inventing new copy.
    expect(screen.getByText('No runs yet')).toBeInTheDocument()
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
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
    })
    renderRuns()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
  })

  // Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
  // tasks.md 2.7): a caller without runCreate must not see "+ New run" at
  // all — not disabled, absent — since this page will also render for
  // anonymous visitors on a public project.
  it('hides "+ New run" (both the header and empty-state buttons) for a caller lacking runCreate', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' })], { ...fullPermissions, runCreate: false })
    renderRuns()
    await screen.findByRole('link', { name: /sprint 1/i })
    expect(screen.queryByRole('link', { name: /\+ new run/i })).not.toBeInTheDocument()
  })

  it('hides the empty-state "+ New run" CTA for a caller with no permissions', async () => {
    mockRunsAPI([], noPermissions)
    renderRuns()
    await screen.findByText(/no runs yet/i)
    expect(screen.queryByRole('link', { name: /\+ new run/i })).not.toBeInTheDocument()
  })
})

// Dual-mode migration (unify-authenticated-and-public-views tasks.md
// group 8).
describe('anonymous / dual-mode', () => {
  it('fetches from the public API when there is no session', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' })], undefined, true)
    renderRuns()
    await screen.findByRole('link', { name: /sprint 1/i })
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/runs', expect.anything())
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
  })

  it('renders the full runs list with zero "+ New run" affordance', async () => {
    mockRunsAPI([run({ name: 'Sprint 1', status: 'open' })], undefined, true)
    renderRuns()
    await screen.findByRole('link', { name: /sprint 1/i })
    expect(screen.queryByRole('link', { name: /\+ new run/i })).not.toBeInTheDocument()
  })

  it('fires no request while the session check is still in flight', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return new Promise(() => {}) // never resolves
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
    renderRuns()
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
  it('falls back to the public API and renders the runs instead of "not found"', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/permissions')
        return Promise.resolve({ data: undefined, response: { ok: false } })
      if (path === '/api/v1/public/projects/{projectKey}')
        return Promise.resolve({ data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' }, response: { ok: true } })
      if (path === '/api/v1/public/projects/{projectKey}/runs')
        return Promise.resolve({ data: { items: [run({ name: 'Sprint 1', status: 'open' })], nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderRuns()
    expect(await screen.findByRole('link', { name: /sprint 1/i })).toBeInTheDocument()
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
  })
})
