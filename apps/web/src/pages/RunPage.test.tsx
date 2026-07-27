import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import RunPage from './RunPage'
import { api } from '@/lib/api'
import { useBumpDataRevision } from '@/lib/DataRevision'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))
vi.mock('@/lib/DataRevision', () => ({ useBumpDataRevision: vi.fn() }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
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
  assignee: '',
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

function mockRunAPI(items: unknown[], summary?: unknown, runOverride?: unknown, suiteOverride?: unknown) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/runs/{runKey}')
      return Promise.resolve({ data: runOverride ?? run, response: { ok: true } })
    if (path === '/api/v1/runs/{runKey}/items')
      return Promise.resolve({ data: items, response: { ok: true } })
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
    if (path === '/api/v1/suites/{suiteKey}')
      return Promise.resolve({
        data: suiteOverride ?? { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Regression', caseIds: [], createdAt: '', passRate: null, lastRunAt: null },
        response: { ok: true },
      })
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
      <Routes>
        <Route path="/runs/:runKey" element={<RunPage />} />
        <Route path="/runs/:runKey/items/:caseKey" element={<ItemPageProbe />} />
        <Route path="/projects/:projectKey/cases/:caseKey" element={<CaseLibraryProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(useBumpDataRevision).mockReturnValue(mockBump)
})

describe('Run execution board', () => {
  it('shows a breadcrumb with Projects, the project name, and the run name', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/')
    expect(await within(nav).findByText('QA Platform')).toBeInTheDocument()
    expect(within(nav).getByText('Sprint 1')).toBeInTheDocument()
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
    renderRun()
    const link = await screen.findByRole('link', { name: /from suite: regression/i })
    expect(link).toHaveAttribute('href', '/projects/p1/suites/p1-S1')
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
    await userEvent.click(screen.getByRole('button', { name: /^failed/i }))
    await userEvent.click(screen.getByRole('button', { name: /^all/i }))

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
    expect(screen.getByRole('button', { name: /close run/i })).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: /close run/i }))

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
    expect(screen.getByRole('button', { name: /reopen/i })).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: /reopen/i }))

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
