import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import SuitesPage from './SuitesPage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

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
// instead (unify-authenticated-and-public-views tasks.md 7.1).
function mockSuitesAPI(project: unknown, suites: unknown[] = [], permissions: unknown = fullPermissions, anonymous = false) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me')
      return anonymous
        ? Promise.resolve({ data: undefined, response: { ok: false } })
        : Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    const projectPath = anonymous ? '/api/v1/public/projects/{projectKey}' : '/api/v1/projects/{projectKey}'
    const suitesPath = anonymous ? '/api/v1/public/projects/{projectKey}/suites' : '/api/v1/projects/{projectKey}/suites'
    if (path === projectPath) return Promise.resolve({ data: project, response: { ok: true } })
    if (path === suitesPath) return Promise.resolve({ data: { items: suites, nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions' && !anonymous)
      return Promise.resolve({ data: permissions === null ? undefined : permissions, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

const projectQA = { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' }

function renderSuites() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/suites']}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/suites" element={<SuitesPage />} />
          <Route path="/login" element={<p>login stub</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  navigatedTo = undefined
})

describe('SuitesPage', () => {
  it('shows no breadcrumb — the header chip already covers the project, and the page heading already says "Suites"', async () => {
    mockSuitesAPI(projectQA)
    renderSuites()
    await screen.findByRole('heading', { name: 'Suites' })
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
  })

  it('shows each suite as a card with name, case count, and a status pill + progress bar (polish-library-and-suites-pages)', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1', 'c2'], createdAt: '', passRate: 90, lastRunAt: '2026-07-25T10:00:00Z' },
    ])
    renderSuites()
    const list = await screen.findByRole('list', { name: 'Suites' })
    expect(within(list).getByText('Smoke')).toBeInTheDocument()
    expect(within(list).getByText(/2 cases/i)).toBeInTheDocument()
    expect(within(list).getByText('Healthy')).toBeInTheDocument()
    expect(list.querySelector('[data-track]')).toBeInTheDocument()
    // Suite's established icon, matching FolderExplorerPage's row-icon treatment —
    // fix-entity-icon-consistency.
    expect(list.querySelector('.lucide-layers')).toBeInTheDocument()
  })

  it('shows "Never run" instead of a fake 0% for a suite with no runs yet', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Onboarding', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
    ])
    renderSuites()
    const list = await screen.findByRole('list', { name: 'Suites' })
    expect(within(list).getByText(/never run/i)).toBeInTheDocument()
    expect(within(list).queryByText('0%')).not.toBeInTheDocument()
  })

  it('navigates to the suite detail route when a card is clicked', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
    ])
    renderSuites()
    await userEvent.click(await screen.findByText('Smoke'))
    expect(navigatedTo).toBe('/projects/p1/suites/p1-S1')
  })

  it('each card has a right-click / "⋯" context menu offering Run suite, Rename, Delete', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '', passRate: null, lastRunAt: null },
    ])
    renderSuites()

    await userEvent.click(await screen.findByRole('button', { name: /actions for smoke/i }))
    expect(screen.getByRole('menuitem', { name: /run suite/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /rename/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
    // Opening the menu is not the same as navigating into the suite.
    expect(navigatedTo).toBeUndefined()
  })

  it('right-clicking a card opens its context menu without navigating', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '', passRate: null, lastRunAt: null },
    ])
    renderSuites()

    const card = (await screen.findByText('Smoke')).closest('li')
    if (!card) throw new Error('card not found')
    await userEvent.pointer({ keys: '[MouseRight]', target: card })

    expect(await screen.findByRole('menuitem', { name: /rename/i })).toBeInTheDocument()
    expect(navigatedTo).toBeUndefined()
  })

  it('renaming a suite from the index menu updates the card and refreshes the list', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
    ])
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderSuites()

    await userEvent.click(await screen.findByRole('button', { name: /actions for smoke/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }))
    const input = screen.getByLabelText(/suite name/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'Smoke v2')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1' } }, body: { name: 'Smoke v2' } }),
      )
    })
    const suitesGetCalls = mockGET.mock.calls.filter((call) => call[0] === '/api/v1/projects/{projectKey}/suites')
    await waitFor(() => expect(suitesGetCalls.length).toBeGreaterThan(1))
  })

  it('deleting a suite from the index menu removes it and stays on the index', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
    ])
    mockDELETE.mockResolvedValue({ response: { ok: true } })
    renderSuites()

    await userEvent.click(await screen.findByRole('button', { name: /actions for smoke/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => {
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1' } } }),
      )
    })
    expect(navigatedTo).toBeUndefined()
  })

  it('running a suite from the index menu shows a confirmation toast naming the run', async () => {
    mockSuitesAPI(projectQA, [
      { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '', passRate: null, lastRunAt: null },
    ])
    mockPOST.mockResolvedValue({
      data: { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Smoke run', createdAt: '' },
      response: { ok: true },
    })
    renderSuites()

    await userEvent.click(await screen.findByRole('button', { name: /actions for smoke/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /run suite/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create run$/i }))

    expect(await screen.findByText('Run "Smoke run" created.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /view it/i })
    expect(link).toHaveAttribute('href', '/runs/p1-R1')
  })

  it('creating a suite navigates straight into its new detail page, not an inline form', async () => {
    mockSuitesAPI(projectQA, [])
    mockPOST.mockResolvedValue({
      data: { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
      response: { ok: true },
    })
    renderSuites()

    await userEvent.click(await screen.findByRole('button', { name: /new suite/i }))
    await userEvent.type(screen.getByLabelText(/suite name/i), 'Smoke')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/suites',
        expect.objectContaining({ params: { path: { projectKey: 'p1' } }, body: { name: 'Smoke' } }),
      )
    })
    await waitFor(() => expect(navigatedTo).toBe('/projects/p1/suites/p1-S1'))
  })

  it('the Create button stays disabled until a name is entered', async () => {
    mockSuitesAPI(projectQA, [])
    renderSuites()
    await userEvent.click(await screen.findByRole('button', { name: /new suite/i }))
    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/suite name/i), 'Smoke')
    expect(screen.getByRole('button', { name: /^create$/i })).toBeEnabled()
  })

  it('shows empty-state copy when there are no suites yet', async () => {
    mockSuitesAPI(projectQA, [])
    renderSuites()
    expect(await screen.findByText(/no suites yet/i)).toBeInTheDocument()
  })

  it('recovers gracefully when the API is unreachable', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    renderSuites()
    expect(await screen.findByText(/no suites yet/i)).toBeInTheDocument()
  })

  it('shows a not-found message instead of an empty, interactive project when the project does not exist', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderSuites()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new suite/i })).not.toBeInTheDocument()
  })

  // Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
  // tasks.md 2.6): a caller without suiteCreate must not see "+ New suite"
  // at all — not disabled, absent — since this page will also render for
  // anonymous visitors on a public project.
  it('hides "+ New suite" for a caller lacking suiteCreate', async () => {
    mockSuitesAPI(projectQA, [], { ...fullPermissions, suiteCreate: false })
    renderSuites()
    await screen.findByRole('heading', { name: 'Suites' })
    expect(screen.queryByRole('button', { name: /new suite/i })).not.toBeInTheDocument()
  })

  it('threads permissions through to each card\'s context menu, hiding gated items', async () => {
    mockSuitesAPI(
      projectQA,
      [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '', passRate: null, lastRunAt: null }],
      noPermissions,
    )
    renderSuites()

    expect(await screen.findByText('Smoke')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions for smoke/i })).not.toBeInTheDocument()
  })
})

// Dual-mode migration (unify-authenticated-and-public-views tasks.md
// group 7).
describe('anonymous / dual-mode', () => {
  it('fetches from the public API when there is no session', async () => {
    mockSuitesAPI(projectQA, [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null, lastRunAt: null }], undefined, true)
    renderSuites()
    await screen.findByText('Smoke')
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/suites', expect.anything())
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
  })

  it('renders the full suites list with zero "+ New suite" affordance and no per-card menu', async () => {
    mockSuitesAPI(projectQA, [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null, lastRunAt: null }], undefined, true)
    renderSuites()
    await screen.findByText('Smoke')
    expect(screen.queryByRole('button', { name: /new suite/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions for smoke/i })).not.toBeInTheDocument()
  })

  it('fires no request while the session check is still in flight', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return new Promise(() => {}) // never resolves
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
    renderSuites()
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
  it('falls back to the public API and renders the suites instead of "not found"', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/permissions')
        return Promise.resolve({ data: undefined, response: { ok: false } })
      if (path === '/api/v1/public/projects/{projectKey}') return Promise.resolve({ data: projectQA, response: { ok: true } })
      if (path === '/api/v1/public/projects/{projectKey}/suites')
        return Promise.resolve({
          data: {
            items: [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '', passRate: null, lastRunAt: null }],
            nextCursor: null,
          },
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderSuites()
    expect(await screen.findByText('Smoke')).toBeInTheDocument()
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
  })
})
