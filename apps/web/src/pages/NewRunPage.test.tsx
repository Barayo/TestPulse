import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import NewRunPage from './NewRunPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)

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

// permissions: pass `null` (not `undefined` — a default parameter value
// would silently override it) to simulate no permissions data at all.
function mockNewRunAPI(
  cases: unknown[] = [],
  suites: unknown[] = [],
  createdItems: unknown[] = [],
  permissions: unknown = fullPermissions,
  plans: unknown[] = [],
  releases: unknown[] = [{ id: 'r1', key: 'p1-REL1', projectId: 'p1', name: '2026.1', description: '', status: 'active', createdAt: '' }],
) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({
        data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/cases')
      return Promise.resolve({ data: { items: cases, nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/folders')
      return Promise.resolve({ data: { items: folders, nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/suites')
      return Promise.resolve({ data: { items: suites, nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/plans') return Promise.resolve({ data: plans, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/releases') return Promise.resolve({ data: releases, response: { ok: true } })
    if (path === '/api/v1/runs/{runKey}/items')
      return Promise.resolve({ data: { items: createdItems, nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/members')
      return Promise.resolve({ data: { users: [{ userId: 'u-ana', roleId: 'role-tester' }], teams: [] }, response: { ok: true } })
    if (path === '/api/v1/users')
      return Promise.resolve({
        data: { items: [{ id: 'u-ana', email: 'ana@example.com', isTenantAdmin: false, createdAt: '' }], nextCursor: null },
        response: { ok: true },
      })
    if (path === '/api/v1/teams') return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: permissions === null ? undefined : permissions, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location-probe">{location.pathname} {JSON.stringify(location.state)}</p>
}

function renderNewRun(initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries'] = ['/projects/p1/runs/new']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/projects/:projectKey/runs/new" element={<NewRunPage />} />
        <Route path="/runs/:runKey" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('NewRunPage', () => {
  it('shows a breadcrumb: Projects > project name > Runs > New run', async () => {
    mockNewRunAPI()
    renderNewRun()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(await screen.findByText('QA Platform')).toBeInTheDocument()
    expect(nav).toHaveTextContent('New run')
  })

  it('starts with an empty, explicit case selection and a disabled Create run button', async () => {
    mockNewRunAPI([caseA, caseB])
    renderNewRun()
    await screen.findByRole('checkbox', { name: /login works/i })
    expect(screen.getByRole('checkbox', { name: /login works/i })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /create run/i })).toBeDisabled()
  })

  it('Shift+Click range-toggles both cases at once (redesign-case-picker-membership)', async () => {
    mockNewRunAPI([caseA, caseB])
    renderNewRun()
    const login = await screen.findByRole('checkbox', { name: /login works/i })
    const checkout = screen.getByRole('checkbox', { name: /checkout works/i })

    fireEvent.click(login, { shiftKey: true })
    fireEvent.click(checkout, { shiftKey: true })

    expect(login).toBeChecked()
    expect(checkout).toBeChecked()
  })

  it('creates a run from a hand-picked case selection, not every project case', async () => {
    mockNewRunAPI([caseA, caseB])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Sprint 2', createdAt: '' },
      response: { ok: true },
    })
    renderNewRun()

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
    mockNewRunAPI([caseA])
    renderNewRun()
    await userEvent.click(await screen.findByRole('checkbox', { name: /login works/i }))
    expect(screen.getByRole('button', { name: /create run/i })).toBeDisabled()
  })

  it('selecting a suite seeds the selection with its member cases', async () => {
    mockNewRunAPI([caseA, caseB], [smokeSuite])
    renderNewRun()
    await userEvent.selectOptions(await screen.findByLabelText(/suite/i), 'p1-S1')
    expect(screen.getByRole('checkbox', { name: /login works/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /checkout works/i })).not.toBeChecked()
  })

  it('a run created with a suite selected sends suiteKey and that suite\'s cases', async () => {
    mockNewRunAPI([caseA, caseB], [smokeSuite])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Smoke run', createdAt: '' },
      response: { ok: true },
    })
    renderNewRun()
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
    mockNewRunAPI([caseA, caseB], [smokeSuite])
    renderNewRun()
    await userEvent.selectOptions(await screen.findByLabelText(/suite/i), 'p1-S1')
    expect(screen.getByRole('checkbox', { name: /login works/i })).toBeChecked()

    await userEvent.selectOptions(screen.getByLabelText(/suite/i), '')
    expect(screen.getByRole('checkbox', { name: /login works/i })).not.toBeChecked()
  })

  it('a run created with no suite selected is ad hoc (no suiteKey sent)', async () => {
    mockNewRunAPI([caseA])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Ad hoc run', createdAt: '' },
      response: { ok: true },
    })
    renderNewRun()
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

  it('a run created with a configuration typed in sends configuration', async () => {
    mockNewRunAPI([caseA])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Cross-browser run', createdAt: '' },
      response: { ok: true },
    })
    renderNewRun()
    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Cross-browser run')
    await userEvent.type(screen.getByLabelText(/configuration/i), 'Chrome')
    await userEvent.click(await screen.findByRole('checkbox', { name: /login works/i }))
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/runs',
        expect.objectContaining({
          body: { name: 'Cross-browser run', caseKeys: ['p1-1'], configuration: 'Chrome' },
        }),
      )
    })
  })

  it('a run created with configuration left blank omits it entirely', async () => {
    mockNewRunAPI([caseA])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Ad hoc run', createdAt: '' },
      response: { ok: true },
    })
    renderNewRun()
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
    mockNewRunAPI([caseA, caseB], [smokeSuite])
    renderNewRun([
      { pathname: '/projects/p1/runs/new', state: { seedFromSuiteKey: 'p1-S1', seedName: 'Smoke run' } },
    ])
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /login works/i })).toBeChecked()
    })
    expect(screen.getByRole('checkbox', { name: /checkout works/i })).not.toBeChecked()
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Smoke run')
  })

  it('focuses and selects the seeded name so it reads as something to confirm', async () => {
    mockNewRunAPI([caseA, caseB], [smokeSuite])
    renderNewRun([
      { pathname: '/projects/p1/runs/new', state: { seedFromSuiteKey: 'p1-S1', seedName: 'Smoke run' } },
    ])
    const nameInput = (await screen.findByLabelText(/^name$/i)) as HTMLInputElement
    await waitFor(() => expect(nameInput).toHaveValue('Smoke run'))
    expect(nameInput).toHaveFocus()
    expect(nameInput.selectionStart).toBe(0)
    expect(nameInput.selectionEnd).toBe('Smoke run'.length)
  })

  it('shows no Test Plan field when the project has no test plans anywhere', async () => {
    mockNewRunAPI([caseA], [], [], fullPermissions, [])
    renderNewRun()
    await screen.findByLabelText(/^name$/i)
    expect(screen.queryByLabelText(/test plan/i)).not.toBeInTheDocument()
  })

  it('shows a Test Plan picker grouped by release when the project has test plans', async () => {
    mockNewRunAPI(
      [caseA],
      [],
      [],
      fullPermissions,
      [
        { id: 'pl1', key: 'p1-PLAN1', projectId: 'p1', releaseId: 'r1', releaseKey: 'p1-REL1', name: 'iOS', description: '', createdAt: '' },
      ],
    )
    renderNewRun()
    const select = (await screen.findByLabelText(/test plan/i)) as HTMLSelectElement
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'iOS' })).toBeInTheDocument()
  })

  it('a run created with a test plan selected sends testPlanKey', async () => {
    mockNewRunAPI(
      [caseA],
      [],
      [],
      fullPermissions,
      [{ id: 'pl1', key: 'p1-PLAN1', projectId: 'p1', releaseId: 'r1', releaseKey: 'p1-REL1', name: 'iOS', description: '', createdAt: '' }],
    )
    mockPOST.mockResolvedValue({ data: { key: 'p1-R1', id: 'run1' }, response: { ok: true } })
    renderNewRun()
    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Sprint 1')
    await userEvent.click(screen.getByRole('checkbox', { name: /login works/i }))
    await userEvent.selectOptions(screen.getByLabelText(/test plan/i), 'p1-PLAN1')
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    await waitFor(() =>
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/runs',
        expect.objectContaining({ body: expect.objectContaining({ testPlanKey: 'p1-PLAN1' }) }),
      ),
    )
  })

  it('deep-link route state from a Test Plan\'s "+ New run" action seeds the Test Plan and name', async () => {
    mockNewRunAPI(
      [caseA],
      [],
      [],
      fullPermissions,
      [{ id: 'pl1', key: 'p1-PLAN1', projectId: 'p1', releaseId: 'r1', releaseKey: 'p1-REL1', name: 'iOS', description: '', createdAt: '' }],
    )
    renderNewRun([{ pathname: '/projects/p1/runs/new', state: { seedFromTestPlanKey: 'p1-PLAN1', seedName: 'iOS run' } }])

    const select = (await screen.findByLabelText(/test plan/i)) as HTMLSelectElement
    await waitFor(() => expect(select).toHaveValue('p1-PLAN1'))
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('iOS run')
  })

  it('shows a not-found message instead of an empty, interactive project when the project does not exist', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
    })
    renderNewRun()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create run/i })).not.toBeInTheDocument()
  })

  it('navigates to the new run\'s detail page with a one-shot "just created" flag on success', async () => {
    mockNewRunAPI([caseA])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Ad hoc run', createdAt: '' },
      response: { ok: true },
    })
    renderNewRun()
    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Ad hoc run')
    await userEvent.click(await screen.findByRole('checkbox', { name: /login works/i }))
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    const probe = await screen.findByTestId('location-probe')
    expect(probe).toHaveTextContent('/runs/p1-R2')
    expect(probe).toHaveTextContent('justCreated')
  })

  it('entering a default assignee assigns every created item after the run is created', async () => {
    mockNewRunAPI([caseA, caseB], [], [{ id: 'i1' }, { id: 'i2' }])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Sprint 2', createdAt: '' },
      response: { ok: true },
    })
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderNewRun()

    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Sprint 2')
    await userEvent.click(await screen.findByRole('checkbox', { name: /login works/i }))
    await userEvent.click(screen.getByRole('button', { name: /default assignee/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'ana@example.com' }))
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/status',
        expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { assigneeUserId: 'u-ana' } }),
      )
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/status',
        expect.objectContaining({ params: { path: { itemId: 'i2' } }, body: { assigneeUserId: 'u-ana' } }),
      )
    })
  })

  it('leaving the default assignee empty creates the run without any assign calls', async () => {
    mockNewRunAPI([caseA], [], [{ id: 'i1' }])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', key: 'p1-R2', projectId: 'p1', name: 'Ad hoc run', createdAt: '' },
      response: { ok: true },
    })
    renderNewRun()

    await userEvent.type(await screen.findByLabelText(/^name$/i), 'Ad hoc run')
    await userEvent.click(await screen.findByRole('checkbox', { name: /login works/i }))
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    await screen.findByTestId('location-probe')
    expect(mockPUT).not.toHaveBeenCalled()
  })

  // Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
  // tasks.md 2.8): this whole page is a create-run form — an authenticated
  // user who navigates here directly without runCreate must see a
  // permission-denied message instead of the form, not just a disabled
  // submit button.
  it('shows a permission-denied message instead of the form for a caller lacking runCreate', async () => {
    mockNewRunAPI([caseA], [], [], { ...fullPermissions, runCreate: false })
    renderNewRun()
    expect(await screen.findByText(/don.t have permission/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create run/i })).not.toBeInTheDocument()
  })
})
