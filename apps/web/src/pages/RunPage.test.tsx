import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import RunPage from './RunPage'
import { api } from '@/lib/api'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))
vi.mock('@/lib/DataRevision', () => ({ useBumpDataRevision: vi.fn() }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)
const mockBump = vi.fn()

const run = {
  id: 'r1',
  key: 'r1',
  projectId: 'p1',
  projectKey: 'p1',
  name: 'Sprint 1',
  status: 'open' as const,
  createdAt: '',
}
const pendingItem = {
  id: 'i1',
  runId: 'r1',
  caseId: 'c1',
  caseKey: 'c1',
  caseVersion: 1,
  assignee: null,
  currentStatus: 'pending',
  newerVersion: false,
  testName: 'login_spec.ts::works',
  createdAt: '',
  content: {
    title: 'Login works',
    description: '',
    steps: [{ action: 'open login page', expected: 'form visible' }],
    expectedResult: 'user is logged in',
    priority: 'medium',
    tags: ['smoke'],
    platform: 'web',
    testType: 'e2e',
  },
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

// permissions: pass `null` (not `undefined` — a default parameter value
// would silently override it) to simulate no permissions data at all.
// anonymous: true simulates no session — reads from /api/v1/public/...
// instead (unify-authenticated-and-public-views tasks.md 6.1).
function mockRunAPI(
  items: unknown[],
  summary?: unknown,
  runOverride?: unknown,
  suiteOverride?: unknown,
  permissions: unknown = fullPermissions,
  anonymous = false,
) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me')
      return anonymous
        ? Promise.resolve({ data: undefined, response: { ok: false } })
        : Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    const runPath = anonymous ? '/api/v1/public/runs/{runKey}' : '/api/v1/runs/{runKey}'
    const itemsPath = anonymous ? '/api/v1/public/runs/{runKey}/items' : '/api/v1/runs/{runKey}/items'
    const summaryPath = anonymous ? '/api/v1/public/runs/{runKey}/summary' : '/api/v1/runs/{runKey}/summary'
    const projectPath = anonymous ? '/api/v1/public/projects/{projectKey}' : '/api/v1/projects/{projectKey}'
    const suitePath = anonymous ? '/api/v1/public/suites/{suiteKey}' : '/api/v1/suites/{suiteKey}'
    if (path === runPath) return Promise.resolve({ data: runOverride ?? run, response: { ok: true } })
    if (path === itemsPath) return Promise.resolve({ data: items, response: { ok: true } })
    if (path === summaryPath)
      return Promise.resolve({
        data: summary ?? { runId: 'r1', total: items.length, counts: { pending: items.length } },
        response: { ok: true },
      })
    if (path === projectPath)
      return Promise.resolve({
        data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === suitePath)
      return Promise.resolve({
        data: suiteOverride ?? { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Regression', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/permissions' && !anonymous)
      return Promise.resolve({ data: permissions === null ? undefined : permissions, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function mockAssignmentAPI(items: unknown[], summary?: unknown) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    if (path === '/api/v1/runs/{runKey}') return Promise.resolve({ data: run, response: { ok: true } })
    if (path === '/api/v1/runs/{runKey}/items') return Promise.resolve({ data: items, response: { ok: true } })
    if (path === '/api/v1/runs/{runKey}/summary')
      return Promise.resolve({
        data: summary ?? { runId: 'r1', total: items.length, counts: { pending: items.length } },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({
        data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/members')
      return Promise.resolve({
        data: {
          users: [
            { userId: 'u-ana', roleId: 'role-tester' },
            { userId: 'u-luis', roleId: 'role-tester' },
          ],
          teams: [],
        },
        response: { ok: true },
      })
    if (path === '/api/v1/users')
      return Promise.resolve({
        data: [
          { id: 'u-ana', email: 'ana@example.com', isTenantAdmin: false, createdAt: '' },
          { id: 'u-luis', email: 'luis@example.com', isTenantAdmin: false, createdAt: '' },
        ],
        response: { ok: true },
      })
    if (path === '/api/v1/teams') return Promise.resolve({ data: [], response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: fullPermissions, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function ItemPageProbe() {
  const { runKey, caseKey } = useParams<{ runKey?: string; caseKey?: string }>()
  return <p data-testid="item-page-probe">item {runKey} {caseKey}</p>
}

function CaseLibraryProbe() {
  const { projectKey, caseKey } = useParams<{ projectKey?: string; caseKey?: string }>()
  return <p data-testid="case-library-probe">case {projectKey} {caseKey}</p>
}

function renderRun(initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries'] = ['/runs/r1']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
      <Routes>
        <Route path="/runs/:runKey" element={<RunPage />} />
        <Route path="/runs/:runKey/items/:caseKey" element={<ItemPageProbe />} />
        <Route path="/projects/:projectKey/cases/:caseKey" element={<CaseLibraryProbe />} />
        <Route path="/login" element={<p>login stub</p>} />
      </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(useBumpDataRevision).mockReturnValue(mockBump)
})

describe('Run execution board', () => {
  it('shows no breadcrumb — the header chip already covers the project, and the run name is already the page heading', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    await screen.findByText('Sprint 1', { selector: '[data-slot="card-title"]' })
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
  })

  it('shows run items with status chips and identifying metadata', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    expect(await screen.findByText('Login works')).toBeInTheDocument()
    expect(screen.getByText('login_spec.ts::works')).toBeInTheDocument()
    expect(screen.getByText('web')).toBeInTheDocument()
    expect(screen.getByText('smoke')).toBeInTheDocument()
    expect(screen.getAllByText(/pending/i).length).toBeGreaterThan(0)
  })

  it('renders the item status chip via the shared StatusBadge (with its dot indicator)', async () => {
    mockRunAPI([pendingItem])
    const { container } = renderRun()
    await screen.findByText('Login works')
    expect(container.querySelector('[data-dot]')).not.toBeNull()
  })

  it('shows the newer-version hint on outdated pins', async () => {
    mockRunAPI([{ ...pendingItem, newerVersion: true }])
    renderRun()
    expect(await screen.findByText(/newer version/i)).toBeInTheDocument()
  })

  it('shows the status breakdown for the run', async () => {
    mockRunAPI([pendingItem], { runId: 'r1', total: 1, counts: { pending: 1 } })
    renderRun()
    await screen.findByText('Login works')
    expect(screen.getByLabelText(/status breakdown/i)).toBeInTheDocument()
  })

  it('navigates to the item\'s own page when selected, instead of showing detail inline', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    await userEvent.click(await screen.findByText('Login works'))
    expect(await screen.findByTestId('item-page-probe')).toHaveTextContent('item r1 c1')
  })

  it('the row menu offers "Open execution" and "Go to case in Library"', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    const row = (await screen.findByText('Login works')).closest('li') as HTMLElement
    await userEvent.click(await within(row).findByRole('button', { name: /actions for login works/i }))

    expect(within(row).getByRole('menuitem', { name: /open execution/i })).toBeInTheDocument()
    expect(within(row).getByRole('menuitem', { name: /go to case in library/i })).toBeInTheDocument()
  })

  it('"Go to case in Library" navigates straight to the case, without visiting the item page', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    const row = (await screen.findByText('Login works')).closest('li') as HTMLElement
    await userEvent.click(await within(row).findByRole('button', { name: /actions for login works/i }))
    await userEvent.click(within(row).getByRole('menuitem', { name: /go to case in library/i }))

    expect(await screen.findByTestId('case-library-probe')).toHaveTextContent('case p1 c1')
    expect(screen.queryByTestId('item-page-probe')).not.toBeInTheDocument()
  })

  it('"Open execution" from the menu navigates to the item\'s own page', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    const row = (await screen.findByText('Login works')).closest('li') as HTMLElement
    await userEvent.click(await within(row).findByRole('button', { name: /actions for login works/i }))
    await userEvent.click(within(row).getByRole('menuitem', { name: /open execution/i }))

    expect(await screen.findByTestId('item-page-probe')).toHaveTextContent('item r1 c1')
  })

  it('recovers gracefully when the API is unreachable', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    renderRun()
    await waitFor(() => expect(mockGET).toHaveBeenCalled())
    expect(screen.queryByText('Login works')).not.toBeInTheDocument()
  })

  it('shows a not-found message instead of an empty, interactive board when the run does not exist or is not accessible', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
      if (path === '/api/v1/runs/{runKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderRun()
    expect(await screen.findByText(/run not found/i)).toBeInTheDocument()
  })
})

describe('Suite linkage and metadata (rework-run-detail-ux)', () => {
  it('links to the source suite when the run has one, showing its name', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, suiteKey: 'p1-S1' }, { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Regression', caseIds: [], createdAt: '', passRate: null, lastRunAt: null })
    const { container } = renderRun()
    const link = await screen.findByRole('link', { name: /from suite: regression/i })
    expect(link).toHaveAttribute('href', '/projects/p1/suites/p1-S1')
    // Suite's established icon everywhere else (ProjectLandingPanels, RolesPage) is
    // LayersIcon, not FolderIcon (that's Section's icon) — fix-entity-icon-consistency.
    expect(link.querySelector('.lucide-layers')).toBeInTheDocument()
    expect(container.querySelector('.lucide-folder')).not.toBeInTheDocument()
  })

  it('shows an explicit ad hoc state when the run has no suite', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, suiteKey: null })
    renderRun()
    await screen.findByText('Login works')
    expect(screen.getByText(/ad hoc run/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /from suite/i })).not.toBeInTheDocument()
  })

  it('shows the created date', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, suiteKey: null, createdAt: '2026-07-24T00:00:00Z' })
    renderRun()
    await screen.findByText('Login works')
    expect(screen.getByText(new RegExp(new Date('2026-07-24T00:00:00Z').toLocaleDateString()))).toBeInTheDocument()
  })
})

describe('Status filter (rework-run-detail-ux)', () => {
  const passItem = { ...pendingItem, id: 'i2', caseKey: 'c2', currentStatus: 'pass', content: { ...pendingItem.content, title: 'Checkout works' } }
  const failedItem = { ...pendingItem, id: 'i3', caseKey: 'c3', currentStatus: 'failed', content: { ...pendingItem.content, title: 'Logout works' } }
  const summary = { runId: 'r1', total: 3, counts: { pending: 1, pass: 1, failed: 1 } }

  it('renders one chip per status present, with counts, plus "All"', async () => {
    mockRunAPI([pendingItem, passItem, failedItem], summary)
    renderRun()
    await screen.findByText('Login works')
    const group = screen.getByRole('group', { name: /filter items by status/i })
    expect(within(group).getByRole('button', { name: /all/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /pass/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /failed/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /pending/i })).toBeInTheDocument()
    expect(within(group).queryByRole('button', { name: /blocked/i })).not.toBeInTheDocument()
  })

  it('selecting a chip narrows the list to that status and updates the count line', async () => {
    mockRunAPI([pendingItem, passItem, failedItem], summary)
    renderRun()
    await screen.findByText('Login works')
    await userEvent.click(screen.getByRole('button', { name: /^failed/i }))

    expect(screen.queryByText('Login works')).not.toBeInTheDocument()
    expect(screen.getByText('Logout works')).toBeInTheDocument()
    expect(screen.getByText(/showing.*1.*of 3 items/i)).toBeInTheDocument()
  })

  it('"All" resets the filter back to every item', async () => {
    mockRunAPI([pendingItem, passItem, failedItem], summary)
    renderRun()
    await screen.findByText('Login works')
    const group = screen.getByRole('group', { name: /filter items by status/i })
    await userEvent.click(within(group).getByRole('button', { name: /^failed/i }))
    await userEvent.click(within(group).getByRole('button', { name: /^all/i }))

    expect(screen.getByText('Login works')).toBeInTheDocument()
    expect(screen.getByText('Checkout works')).toBeInTheDocument()
    expect(screen.getByText('Logout works')).toBeInTheDocument()
  })
})

describe('Group by status (rework-run-detail-ux)', () => {
  const passItem = { ...pendingItem, id: 'i2', caseKey: 'c2', currentStatus: 'pass', content: { ...pendingItem.content, title: 'Checkout works' } }
  const failedItem = { ...pendingItem, id: 'i3', caseKey: 'c3', currentStatus: 'failed', content: { ...pendingItem.content, title: 'Logout works' } }
  const summary = { runId: 'r1', total: 3, counts: { pending: 1, pass: 1, failed: 1 } }

  it('reorders the list into status sections, bad-outcomes-first, when toggled on', async () => {
    mockRunAPI([pendingItem, passItem, failedItem], summary)
    renderRun()
    await screen.findByText('Login works')
    await userEvent.click(screen.getByRole('switch', { name: /group by status/i }))

    const headings = screen.getAllByText(/pass · 1|failed · 1|pending · 1/i).map((el) => el.textContent)
    expect(headings).toEqual(['Pass · 1', 'Failed · 1', 'Pending · 1'])
  })

  it('composes with an active filter, collapsing to a single section', async () => {
    mockRunAPI([pendingItem, passItem, failedItem], summary)
    renderRun()
    await screen.findByText('Login works')
    await userEvent.click(screen.getByRole('switch', { name: /group by status/i }))
    await userEvent.click(screen.getByRole('button', { name: /^failed/i }))

    expect(screen.getByText('Failed · 1')).toBeInTheDocument()
    expect(screen.queryByText(/pass · 1/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pending · 1/i)).not.toBeInTheDocument()
  })
})

describe('Run lifecycle (open/closed)', () => {
  it('shows an open badge and a Close control for an open run', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    expect(await screen.findByText(/^open$/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /close run/i })).toBeInTheDocument()
  })

  it('closes the run', async () => {
    mockRunAPI([pendingItem])
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await userEvent.click(await screen.findByRole('button', { name: /close run/i }))
    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/runs/{runKey}/close',
        expect.objectContaining({ params: { path: { runKey: 'r1' } } }),
      )
    })
  })

  it('updates the status badge immediately on close, without re-fetching items or summary', async () => {
    mockRunAPI([pendingItem])
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await screen.findByText(/^open$/i)
    const getCallsBeforeClose = mockGET.mock.calls.length

    await userEvent.click(await screen.findByRole('button', { name: /close run/i }))

    expect(await screen.findByText(/^closed$/i)).toBeInTheDocument()
    expect(mockGET.mock.calls.length).toBe(getCallsBeforeClose)
  })

  it('shows a disabled "Closing…" state while the close request is in flight', async () => {
    mockRunAPI([pendingItem])
    let resolveClose!: (v: { response: { ok: true } }) => void
    mockPOST.mockReturnValue(new Promise((resolve) => (resolveClose = resolve)))
    renderRun()
    await userEvent.click(await screen.findByRole('button', { name: /close run/i }))

    const closingButton = await screen.findByRole('button', { name: /closing…/i })
    expect(closingButton).toBeDisabled()

    resolveClose({ response: { ok: true } })
    expect(await screen.findByText(/^closed$/i)).toBeInTheDocument()
  })

  it('re-enables the close control and shows an error on a generic failure', async () => {
    mockRunAPI([pendingItem])
    mockPOST.mockResolvedValue({ error: { error: 'boom' }, response: { ok: false } })
    renderRun()
    await userEvent.click(await screen.findByRole('button', { name: /close run/i }))

    expect(await screen.findByText(/could not close this run/i)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /^close run$/i })
    expect(button).not.toBeDisabled()
    expect(await screen.findByText(/^open$/i)).toBeInTheDocument()
  })

  it('invalidates other pages\' cached data after closing', async () => {
    mockRunAPI([pendingItem])
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await userEvent.click(await screen.findByRole('button', { name: /close run/i }))
    await waitFor(() => expect(mockBump).toHaveBeenCalled())
  })

  it('shows a closed badge and a Reopen control for a closed run', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, status: 'closed' })
    renderRun()
    expect(await screen.findByText(/^closed$/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /reopen/i })).toBeInTheDocument()
  })

  it('reopens the run', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, status: 'closed' })
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await userEvent.click(await screen.findByRole('button', { name: /reopen/i }))
    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/runs/{runKey}/reopen',
        expect.objectContaining({ params: { path: { runKey: 'r1' } } }),
      )
    })
  })

  it('shows a permission message when reopening is forbidden', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, status: 'closed' })
    mockPOST.mockResolvedValue({ error: { error: 'forbidden' }, response: { ok: false } })
    renderRun()
    await userEvent.click(await screen.findByRole('button', { name: /reopen/i }))
    expect(await screen.findByText(/project admin/i)).toBeInTheDocument()
  })

  it('re-enables the reopen control after a forbidden reopen', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, status: 'closed' })
    mockPOST.mockResolvedValue({ error: { error: 'forbidden' }, response: { ok: false } })
    renderRun()
    await userEvent.click(await screen.findByRole('button', { name: /reopen/i }))
    await screen.findByText(/project admin/i)
    expect(screen.getByRole('button', { name: /^reopen$/i })).not.toBeDisabled()
    expect(await screen.findByText(/^closed$/i)).toBeInTheDocument()
  })

  it('updates the status badge immediately on reopen, without re-fetching items or summary', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, status: 'closed' })
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await screen.findByText(/^closed$/i)
    const getCallsBeforeReopen = mockGET.mock.calls.length

    await userEvent.click(await screen.findByRole('button', { name: /reopen/i }))

    expect(await screen.findByText(/^open$/i)).toBeInTheDocument()
    expect(mockGET.mock.calls.length).toBe(getCallsBeforeReopen)
  })

  it('shows a disabled "Reopening…" state while the reopen request is in flight', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, status: 'closed' })
    let resolveReopen!: (v: { response: { ok: true } }) => void
    mockPOST.mockReturnValue(new Promise((resolve) => (resolveReopen = resolve)))
    renderRun()
    await userEvent.click(await screen.findByRole('button', { name: /reopen/i }))

    const reopeningButton = await screen.findByRole('button', { name: /reopening…/i })
    expect(reopeningButton).toBeDisabled()

    resolveReopen({ response: { ok: true } })
    expect(await screen.findByText(/^open$/i)).toBeInTheDocument()
  })

  it('invalidates other pages\' cached data after reopening', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, status: 'closed' })
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await userEvent.click(await screen.findByRole('button', { name: /reopen/i }))
    await waitFor(() => expect(mockBump).toHaveBeenCalled())
  })

  it('shows a one-shot "Run created" banner when arriving via the justCreated router state', async () => {
    mockRunAPI([pendingItem])
    renderRun([{ pathname: '/runs/r1', state: { justCreated: true } }])
    expect(await screen.findByText(/run created successfully/i)).toBeInTheDocument()
  })

  it('does not show the "Run created" banner on a normal visit', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    await screen.findAllByText(run.name)
    expect(screen.queryByText(/run created successfully/i)).not.toBeInTheDocument()
  })

})

describe('Keyboard navigation (add-run-keyboard-shortcuts)', () => {
  const item2 = { ...pendingItem, id: 'i2', caseKey: 'c2', content: { ...pendingItem.content, title: 'Checkout works' } }
  const item3 = { ...pendingItem, id: 'i3', caseKey: 'c3', content: { ...pendingItem.content, title: 'Logout works' } }

  it('j moves the focus cursor down the visible list; Enter opens the focused item', async () => {
    mockRunAPI([pendingItem, item2, item3])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.keyboard('jjj')
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByTestId('item-page-probe')).toHaveTextContent('item r1 c3')
  })

  it('k moves the focus cursor back up', async () => {
    mockRunAPI([pendingItem, item2, item3])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.keyboard('jjj')
    await userEvent.keyboard('k')
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByTestId('item-page-probe')).toHaveTextContent('item r1 c2')
  })

  it('j/k/Enter do nothing while an unrelated input has focus', async () => {
    mockRunAPI([pendingItem, item2, item3])
    renderRun()
    await screen.findByText('Login works')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    await userEvent.keyboard('jjj{Enter}')

    expect(screen.queryByTestId('item-page-probe')).not.toBeInTheDocument()
    input.remove()
  })

  it('ArrowDown/ArrowUp move the focus cursor the same as j/k', async () => {
    mockRunAPI([pendingItem, item2, item3])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByTestId('item-page-probe')).toHaveTextContent('item r1 c2')
  })

  it('the focused row gets a visible background tint, not just a hairline ring', async () => {
    mockRunAPI([pendingItem, item2])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.keyboard('j')

    const focused = document.querySelector('[data-focused="true"]')
    expect(focused).not.toBeNull()
    expect(focused).toHaveClass('bg-accent')
  })

  it('shows a persistent shortcuts hint and opens an overlay with ?', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    await screen.findByText('Login works')

    expect(screen.getByLabelText('Keyboard shortcuts')).toBeInTheDocument()

    await userEvent.keyboard('?')

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('Assignment (add-run-item-assignment-ui)', () => {
  const assignedItem = {
    ...pendingItem,
    id: 'i2',
    caseKey: 'c2',
    assignee: { kind: 'user' as const, id: 'u-ana', name: 'ana@example.com', avatarKey: 'ada-lovelace' },
    content: { ...pendingItem.content, title: 'Checkout works' },
  }
  const otherAssignedItem = {
    ...pendingItem,
    id: 'i3',
    caseKey: 'c3',
    assignee: { kind: 'user' as const, id: 'u-luis', name: 'luis@example.com' },
    content: { ...pendingItem.content, title: 'Logout works' },
  }

  it('a user assignee with a chosen avatar renders through the shared Avatar (add-user-profile)', async () => {
    mockAssignmentAPI([pendingItem, assignedItem])
    renderRun()
    await screen.findByText('Login works')

    const assignedRow = screen.getByText('Checkout works').closest('li') as HTMLElement
    const img = within(assignedRow).getByRole('img')
    expect(img.getAttribute('src')).toMatch(/ada-lovelace/)
  })

  it('a row shows its assignee, or Unassigned when none', async () => {
    mockAssignmentAPI([pendingItem, assignedItem])
    renderRun()
    await screen.findByText('Login works')

    const unassignedRow = screen.getByText('Login works').closest('li') as HTMLElement
    const assignedRow = screen.getByText('Checkout works').closest('li') as HTMLElement
    expect(within(unassignedRow).getByText('Unassigned')).toBeInTheDocument()
    expect(within(assignedRow).getByText('ana@example.com')).toBeInTheDocument()
  })

  it('the row menu\'s "Assign to…" opens AssignDialog listing project members', async () => {
    mockAssignmentAPI([pendingItem, assignedItem, otherAssignedItem])
    renderRun()
    await screen.findByText('Login works')

    const row = screen.getByText('Checkout works').closest('li') as HTMLElement
    await userEvent.click(await within(row).findByRole('button', { name: /actions for checkout works/i }))
    await userEvent.click(within(row).getByRole('menuitem', { name: /assign to/i }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ana@example.com' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'luis@example.com' })).toBeInTheDocument()
  })

  it('submitting the dialog assigns the item and updates the row without a full reload', async () => {
    mockAssignmentAPI([pendingItem])
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await screen.findByText('Login works')

    const row = screen.getByText('Login works').closest('li') as HTMLElement
    await userEvent.click(await within(row).findByRole('button', { name: /actions for login works/i }))
    await userEvent.click(within(row).getByRole('menuitem', { name: /assign to/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'ana@example.com' }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/status',
        expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { assigneeUserId: 'u-ana' } }),
      )
    })
    expect(await within(row).findByText('ana@example.com')).toBeInTheDocument()
  })

  it('the assignee filter renders one chip per distinct assignee, plus Unassigned and All', async () => {
    mockRunAPI([pendingItem, assignedItem, otherAssignedItem])
    renderRun()
    await screen.findByText('Login works')

    const group = screen.getByRole('group', { name: /filter items by assignee/i })
    expect(within(group).getByRole('button', { name: /^all/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /^ana/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /^luis/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /unassigned/i })).toBeInTheDocument()
  })

  it('selecting an assignee chip narrows the list; Unassigned narrows to items with no assignee', async () => {
    mockRunAPI([pendingItem, assignedItem, otherAssignedItem])
    renderRun()
    await screen.findByText('Login works')

    const group = screen.getByRole('group', { name: /filter items by assignee/i })
    await userEvent.click(within(group).getByRole('button', { name: /^ana/i }))

    expect(screen.getByText('Checkout works')).toBeInTheDocument()
    expect(screen.queryByText('Login works')).not.toBeInTheDocument()
    expect(screen.queryByText('Logout works')).not.toBeInTheDocument()

    await userEvent.click(within(group).getByRole('button', { name: /unassigned/i }))

    expect(screen.getByText('Login works')).toBeInTheDocument()
    expect(screen.queryByText('Checkout works')).not.toBeInTheDocument()
  })

  it('the assignee filter composes with an active status filter', async () => {
    const assignedFailed = { ...assignedItem, currentStatus: 'failed' }
    mockRunAPI(
      [pendingItem, assignedFailed],
      { runId: 'r1', total: 2, counts: { pending: 1, failed: 1 } },
    )
    renderRun()
    await screen.findByText('Login works')

    const statusGroup = screen.getByRole('group', { name: /filter items by status/i })
    await userEvent.click(within(statusGroup).getByRole('button', { name: /^failed/i }))
    const assigneeGroup = screen.getByRole('group', { name: /filter items by assignee/i })
    await userEvent.click(within(assigneeGroup).getByRole('button', { name: /^ana/i }))

    expect(screen.getByText('Checkout works')).toBeInTheDocument()
    expect(screen.queryByText('Login works')).not.toBeInTheDocument()
  })

  it('checking a row checkbox shows a bulk action bar with the selection count', async () => {
    mockRunAPI([pendingItem, assignedItem])
    renderRun()
    await screen.findByText('Login works')

    const row = screen.getByText('Login works').closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('checkbox', { name: /select login works/i }))

    expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
  })

  it('select all selects every currently visible item, not items hidden by an active filter', async () => {
    const passItem = { ...pendingItem, id: 'i2', caseKey: 'c2', currentStatus: 'pass', content: { ...pendingItem.content, title: 'Checkout works' } }
    mockRunAPI([pendingItem, passItem], { runId: 'r1', total: 2, counts: { pending: 1, pass: 1 } })
    renderRun()
    await screen.findByText('Login works')
    const statusGroup = screen.getByRole('group', { name: /filter items by status/i })
    await userEvent.click(within(statusGroup).getByRole('button', { name: /^pass/i }))

    await userEvent.click(screen.getByRole('checkbox', { name: /select all/i }))

    expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
  })

  it('bulk-assigning from the action bar assigns every selected item and clears the selection', async () => {
    mockAssignmentAPI([pendingItem, assignedItem])
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /select checkout works/i }))
    await userEvent.click(screen.getByRole('button', { name: /assign selected/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'ana@example.com' }))

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
    expect(screen.queryByText(/^\d+ selected$/i)).not.toBeInTheDocument()
  })
})

describe('Bulk verdict actions (add-bulk-status-verdicts)', () => {
  const secondItem = { ...pendingItem, id: 'i2', caseKey: 'c2', content: { ...pendingItem.content, title: 'Checkout works' } }

  it('shows a "Mark as" dropdown listing all four verdicts on an open run', async () => {
    mockRunAPI([pendingItem, secondItem])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /select checkout works/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as' }))

    expect(screen.getByRole('menuitem', { name: 'Pass' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Failed' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Blocked' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Skipped' })).toBeInTheDocument()
  })

  it('picking a verdict from the dropdown records it for every selected item and clears the selection', async () => {
    mockRunAPI([pendingItem, secondItem])
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /select checkout works/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pass' }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { verdict: 'pass' } }),
      )
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({ params: { path: { itemId: 'i2' } }, body: { verdict: 'pass' } }),
      )
    })
    expect(screen.queryByText(/^\d+ selected$/i)).not.toBeInTheDocument()
  })

  it('does not offer a "Mark as" dropdown on a closed run', async () => {
    mockRunAPI([pendingItem, secondItem], undefined, { ...run, status: 'closed' })
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))

    expect(screen.getByRole('button', { name: /assign selected/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as' })).not.toBeInTheDocument()
  })
})

describe('Right-click a row while a multi-selection is active (add-bulk-status-verdicts)', () => {
  const secondItem = { ...pendingItem, id: 'i2', caseKey: 'c2', content: { ...pendingItem.content, title: 'Checkout works' } }
  const thirdItem = { ...pendingItem, id: 'i3', caseKey: 'c3', content: { ...pendingItem.content, title: 'Password reset works' } }

  it('opening the row menu on a checked row, with others also selected, shows the bulk menu instead of single-item actions', async () => {
    mockRunAPI([pendingItem, secondItem, thirdItem])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /select checkout works/i }))
    const row = screen.getByText('Login works').closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: /actions for login works/i }))

    expect(within(row).getByRole('menuitem', { name: 'Assign 2 selected…' })).toBeInTheDocument()
    expect(within(row).getByRole('menuitem', { name: 'Pass' })).toBeInTheDocument()
    expect(within(row).getByRole('menuitem', { name: 'Failed' })).toBeInTheDocument()
    expect(within(row).getByRole('menuitem', { name: 'Blocked' })).toBeInTheDocument()
    expect(within(row).getByRole('menuitem', { name: 'Skipped' })).toBeInTheDocument()
    expect(within(row).queryByRole('menuitem', { name: /open execution/i })).not.toBeInTheDocument()
    expect(within(row).queryByRole('menuitem', { name: /go to case in library/i })).not.toBeInTheDocument()
  })

  it('opening the row menu on an unchecked row, while others are selected, still shows single-item actions and leaves the selection alone', async () => {
    mockRunAPI([pendingItem, secondItem, thirdItem])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /select checkout works/i }))
    const row = screen.getByText('Password reset works').closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: /actions for password reset works/i }))

    expect(within(row).getByRole('menuitem', { name: /open execution/i })).toBeInTheDocument()
    expect(within(row).getByRole('menuitem', { name: /go to case in library/i })).toBeInTheDocument()
    expect(within(row).getByRole('menuitem', { name: /^assign to…$/i })).toBeInTheDocument()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /select password reset works/i })).not.toBeChecked()
  })

  it('picking a verdict from a checked row\'s bulk menu records it for the whole selection', async () => {
    mockRunAPI([pendingItem, secondItem, thirdItem])
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /select checkout works/i }))
    const row = screen.getByText('Login works').closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: /actions for login works/i }))
    await userEvent.click(within(row).getByRole('menuitem', { name: 'Failed' }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { verdict: 'failed' } }),
      )
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({ params: { path: { itemId: 'i2' } }, body: { verdict: 'failed' } }),
      )
    })
  })

  it('picking "Assign N selected…" from a checked row\'s bulk menu opens AssignDialog scoped to the whole selection', async () => {
    mockAssignmentAPI([pendingItem, secondItem, thirdItem])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /select checkout works/i }))
    const row = screen.getByText('Login works').closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: /actions for login works/i }))
    await userEvent.click(within(row).getByRole('menuitem', { name: 'Assign 2 selected…' }))

    expect(await screen.findByText('Assign 2 items to…')).toBeInTheDocument()
  })

  it('the bulk row menu offers no verdict actions on a closed run', async () => {
    mockRunAPI([pendingItem, secondItem, thirdItem], undefined, { ...run, status: 'closed' })
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /select checkout works/i }))
    const row = screen.getByText('Login works').closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: /actions for login works/i }))

    expect(within(row).getByRole('menuitem', { name: 'Assign 2 selected…' })).toBeInTheDocument()
    expect(within(row).queryByRole('menuitem', { name: 'Pass' })).not.toBeInTheDocument()
  })
})

describe('Checkbox opacity (add-run-board-select-shortcuts)', () => {
  const secondItem = { ...pendingItem, id: 'i2', caseKey: 'c2', content: { ...pendingItem.content, title: 'Checkout works' } }

  it('a row checkbox is dimmed at rest — not selected, not focused, no active selection', async () => {
    mockRunAPI([pendingItem, secondItem])
    renderRun()
    await screen.findByText('Login works')

    const checkbox = screen.getByRole('checkbox', { name: /select login works/i })
    expect(checkbox).toHaveClass('opacity-40')
    expect(checkbox).not.toHaveClass('opacity-100')
  })

  it('a row checkbox goes full opacity once it carries the j/k focus cursor', async () => {
    mockRunAPI([pendingItem, secondItem])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.keyboard('j')

    const checkbox = screen.getByRole('checkbox', { name: /select login works/i })
    expect(checkbox).toHaveClass('opacity-100')
    expect(checkbox).not.toHaveClass('opacity-40')
  })

  it('every row checkbox goes full opacity once any item in the list is selected', async () => {
    mockRunAPI([pendingItem, secondItem])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))

    const otherCheckbox = screen.getByRole('checkbox', { name: /select checkout works/i })
    expect(otherCheckbox).toHaveClass('opacity-100')
    expect(otherCheckbox).not.toHaveClass('opacity-40')
  })

  it('the header "select all" checkbox is never dimmed', async () => {
    mockRunAPI([pendingItem, secondItem])
    renderRun()
    await screen.findByText('Login works')

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' })
    expect(selectAll).not.toHaveClass('opacity-40')
  })
})

describe('Space toggles the focused row (add-run-board-select-shortcuts)', () => {
  const secondItem = { ...pendingItem, id: 'i2', caseKey: 'c2', content: { ...pendingItem.content, title: 'Checkout works' } }

  it('pressing Space toggles the j/k-focused item into the selection', async () => {
    mockRunAPI([pendingItem, secondItem])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.keyboard('j')
    await userEvent.keyboard(' ')

    expect(screen.getByRole('checkbox', { name: /select login works/i })).toBeChecked()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('pressing Space again toggles the same item back out', async () => {
    mockRunAPI([pendingItem, secondItem])
    renderRun()
    await screen.findByText('Login works')

    await userEvent.keyboard('j')
    await userEvent.keyboard(' ')
    await userEvent.keyboard(' ')

    expect(screen.getByRole('checkbox', { name: /select login works/i })).not.toBeChecked()
    expect(screen.queryByText(/^\d+ selected$/i)).not.toBeInTheDocument()
  })

  it('Space is ignored while an unrelated input has focus', async () => {
    mockRunAPI([pendingItem, secondItem])
    renderRun()
    await screen.findByText('Login works')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    await userEvent.keyboard(' ')

    expect(screen.queryByText(/^\d+ selected$/i)).not.toBeInTheDocument()
    input.remove()
  })
})

describe('Shift+click range-select (add-run-board-select-shortcuts)', () => {
  const secondItem = { ...pendingItem, id: 'i2', caseKey: 'c2', content: { ...pendingItem.content, title: 'Checkout works' } }
  const thirdItem = { ...pendingItem, id: 'i3', caseKey: 'c3', content: { ...pendingItem.content, title: 'Password reset works' } }

  it('Shift-clicking a row further down adds the whole range to the existing selection', async () => {
    const user = userEvent.setup()
    mockRunAPI([pendingItem, secondItem, thirdItem])
    renderRun()
    await screen.findByText('Login works')

    await user.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await user.keyboard('{Shift>}')
    await user.click(screen.getByRole('checkbox', { name: /select password reset works/i }))
    await user.keyboard('{/Shift}')

    expect(screen.getByRole('checkbox', { name: /select login works/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /select checkout works/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /select password reset works/i })).toBeChecked()
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('Shift-clicking with no prior selection selects just that row and becomes the new anchor', async () => {
    const user = userEvent.setup()
    mockRunAPI([pendingItem, secondItem, thirdItem])
    renderRun()
    await screen.findByText('Login works')

    await user.keyboard('{Shift>}')
    await user.click(screen.getByRole('checkbox', { name: /select checkout works/i }))
    await user.keyboard('{/Shift}')

    expect(screen.getByRole('checkbox', { name: /select login works/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /select checkout works/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /select password reset works/i })).not.toBeChecked()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('a plain click after a Shift+click range still works as an ordinary single toggle', async () => {
    const user = userEvent.setup()
    mockRunAPI([pendingItem, secondItem, thirdItem])
    renderRun()
    await screen.findByText('Login works')

    await user.click(screen.getByRole('checkbox', { name: /select login works/i }))
    await user.keyboard('{Shift>}')
    await user.click(screen.getByRole('checkbox', { name: /select password reset works/i }))
    await user.keyboard('{/Shift}')
    await user.click(screen.getByRole('checkbox', { name: /select checkout works/i }))

    expect(screen.getByRole('checkbox', { name: /select checkout works/i })).not.toBeChecked()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })
})

// Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
// tasks.md 2.5): a caller without the matching permission must not see the
// write controls at all — since this page will also render for anonymous
// visitors on a public project.
describe('permission gating', () => {
  it('hides Close run when the caller lacks runRecordResult', async () => {
    mockRunAPI([pendingItem], undefined, undefined, undefined, { ...fullPermissions, runRecordResult: false })
    renderRun()
    await screen.findByText('Login works')
    expect(screen.queryByRole('button', { name: /close run/i })).not.toBeInTheDocument()
  })

  it('hides Reopen when the caller lacks manageProject', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, status: 'closed' }, undefined, { ...fullPermissions, manageProject: false })
    renderRun()
    await screen.findByText('Login works')
    expect(screen.queryByRole('button', { name: /reopen/i })).not.toBeInTheDocument()
  })

  it('omits "Assign to…" from a row\'s actions menu when the caller lacks runRecordResult', async () => {
    mockRunAPI([pendingItem], undefined, undefined, undefined, { ...fullPermissions, runRecordResult: false })
    renderRun()
    await screen.findByText('Login works')
    await userEvent.click(screen.getByRole('button', { name: /actions for login works/i }))
    expect(screen.queryByRole('menuitem', { name: /assign to/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /open execution/i })).toBeInTheDocument()
  })

  it('hides bulk "Assign selected…" and "Mark as" when the caller lacks runRecordResult', async () => {
    mockRunAPI([pendingItem], undefined, undefined, undefined, { ...fullPermissions, runRecordResult: false })
    renderRun()
    await screen.findByText('Login works')
    await userEvent.click(screen.getByRole('checkbox', { name: /select login works/i }))
    expect(screen.queryByRole('button', { name: /assign selected/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^mark as$/i })).not.toBeInTheDocument()
  })

  it('shows the run read-only with no write controls when the caller has no permissions', async () => {
    mockRunAPI([pendingItem], undefined, undefined, undefined, null)
    renderRun()
    await screen.findByText('Login works')
    expect(screen.queryByRole('button', { name: /close run/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions for login works/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /actions for login works/i }))
    expect(screen.queryByRole('menuitem', { name: /assign to/i })).not.toBeInTheDocument()
  })
})

// Dual-mode migration (unify-authenticated-and-public-views tasks.md
// group 6).
describe('anonymous / dual-mode', () => {
  it('fetches from the public API when there is no session, including the satellite project/suite fetches', async () => {
    mockRunAPI([pendingItem], undefined, { ...run, suiteKey: 'p1-S1' }, undefined, undefined, true)
    renderRun()
    await screen.findByText('Login works')
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/runs/{runKey}', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/runs/{runKey}/items', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/runs/{runKey}/summary', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}', expect.anything())
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/suites/{suiteKey}', expect.anything())
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/runs/{runKey}', expect.anything())
  })

  it('renders the identical run board a member sees, with zero write controls', async () => {
    mockRunAPI([pendingItem], undefined, undefined, undefined, undefined, true)
    renderRun()
    await screen.findByText('Login works')
    expect(screen.queryByRole('button', { name: /close run/i })).not.toBeInTheDocument()
    // The row's actions trigger stays present (it still offers "Open
    // execution"/"Go to case", pure navigation) — only "Assign to…" is
    // gated, already covered by the permission-gating tests above.
    await userEvent.click(screen.getByRole('button', { name: /actions for login works/i }))
    expect(screen.queryByRole('menuitem', { name: /assign to/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /open execution/i })).toBeInTheDocument()
  })

  it('fires no request while the session check is still in flight', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return new Promise(() => {}) // never resolves
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
    renderRun()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/runs/{runKey}', expect.anything())
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/public/runs/{runKey}', expect.anything())
  })

  it('shows a "Log in" link alongside "Go to Projects" when a run is not found anonymously', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: undefined, response: { ok: false } })
      if (path === '/api/v1/public/runs/{runKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderRun()
    expect(await screen.findByText(/run not found/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument()
  })
})

// design.md D11: a signed-in user with no membership on a public
// project's run gets 403 from GET /api/v1/runs/{runKey} (PermRead-gated)
// — the page must retry via the public branch instead of showing "not
// found", exactly like an anonymous visitor would see. projectKey isn't
// known until the run itself loads, so this page resolves access from
// the run fetch's own outcome (same pattern as RunItemDetailPage), not a
// preemptive useProjectReadAccess check.
describe('signed-in non-member (design.md D11)', () => {
  it('falls back to the public API and renders the run instead of "not found"', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
      if (path === '/api/v1/runs/{runKey}' || path === '/api/v1/runs/{runKey}/items' || path === '/api/v1/runs/{runKey}/summary')
        return Promise.resolve({ data: undefined, response: { ok: false } })
      if (path === '/api/v1/public/runs/{runKey}') return Promise.resolve({ data: run, response: { ok: true } })
      if (path === '/api/v1/public/runs/{runKey}/items') return Promise.resolve({ data: [pendingItem], response: { ok: true } })
      if (path === '/api/v1/public/runs/{runKey}/summary')
        return Promise.resolve({ data: { runId: 'r1', total: 1, counts: { pending: 1 } }, response: { ok: true } })
      if (path === '/api/v1/public/projects/{projectKey}')
        return Promise.resolve({
          data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: false } })
    })
    renderRun()
    expect(await screen.findByText('Sprint 1')).toBeInTheDocument()
    expect(screen.queryByText(/run not found/i)).not.toBeInTheDocument()
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/runs/{runKey}/summary', expect.anything())
  })
})
