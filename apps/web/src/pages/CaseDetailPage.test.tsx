import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import CaseDetailPage from './CaseDetailPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}))
const mockGET = vi.mocked(api.GET)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

const root = { id: 'root', projectId: 'p1', name: 'Root', createdAt: '' }
const transferencias = { id: 'transferencias', projectId: 'p1', parentFolderId: 'root', name: 'Transferencias', createdAt: '' }

const limitCase = {
  id: 'c1',
  projectId: 'p1',
  folderId: 'transferencias',
  currentVersion: 2,
  content: {
    title: 'Daily transfer limit',
    description: 'Ensures over-threshold transfers are blocked',
    steps: [{ action: 'Start a transfer over the limit', expected: 'Blocked before confirming' }],
    expectedResult: 'Transfer blocked',
    priority: 'high',
    tags: ['smoke', 'regression'],
    platform: 'web',
    testType: 'e2e',
    automated: true,
  },
  createdAt: '',
}

function mockDetailAPI(options?: {
  v1Content?: typeof limitCase.content
  versions?: unknown[]
  users?: unknown[]
}) {
  mockGET.mockImplementation((path: string, opts?: { params?: { path?: Record<string, string> } }) => {
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/folders')
      return Promise.resolve({ data: [root, transferencias], response: { ok: true } })
    if (path === '/api/v1/cases/{caseKey}' && opts?.params?.path?.caseKey === 'c1')
      return Promise.resolve({ data: limitCase, response: { ok: true } })
    if (path === '/api/v1/cases/{caseKey}/versions' && opts?.params?.path?.caseKey === 'c1')
      return Promise.resolve({
        data: options?.versions ?? [
          { caseId: 'c1', version: 1, content: options?.v1Content ?? limitCase.content, actorKind: 'unknown', createdAt: '2026-01-01T00:00:00Z' },
          { caseId: 'c1', version: 2, content: limitCase.content, actorKind: 'unknown', createdAt: '2026-02-01T00:00:00Z' },
        ],
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/suites')
      return Promise.resolve({
        data: [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
        response: { ok: true },
      })
    if (path === '/api/v1/cases/{caseKey}/executions') return Promise.resolve({ data: [], response: { ok: true } })
    if (path === '/api/v1/users') return Promise.resolve({ data: options?.users ?? [], response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function LibraryProbe() {
  const { folderId } = useParams<{ folderId?: string }>()
  return <p data-testid="library-probe">library {folderId ?? ''}</p>
}

function renderDetail(path = '/projects/p1/cases/c1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectKey/cases/:caseKey" element={<CaseDetailPage />} />
        <Route path="/projects/:projectKey/library" element={<LibraryProbe />} />
        <Route path="/projects/:projectKey/library/:folderId" element={<LibraryProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CaseDetailPage', () => {
  it('shows a not-found message when the case does not exist or is not accessible', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
      if (path === '/api/v1/cases/{caseKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderDetail()
    expect(await screen.findByText(/case not found/i)).toBeInTheDocument()
    expect(screen.queryByText('Daily transfer limit')).not.toBeInTheDocument()
  })

  it('navigates back to the case\'s own folder — not always the library root — when the back arrow is clicked', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    await userEvent.click(screen.getByRole('link', { name: /back to transferencias/i }))
    expect(await screen.findByTestId('library-probe')).toHaveTextContent('library transferencias')
  })

  it('does not render a separate "Back to Library" line duplicating the breadcrumb', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.queryByText(/back to library/i)).not.toBeInTheDocument()
  })

  it('sizes the back arrow to match the heading, not the ambient body text', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.getByRole('link', { name: /back to transferencias/i })).toHaveClass('text-2xl')
  })

  it('tints the back arrow with the brand color, not flat gray', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    const backLink = screen.getByRole('link', { name: /back to transferencias/i })
    expect(backLink).toHaveClass('text-primary')
    expect(backLink).not.toHaveClass('text-muted-foreground')
  })

  it('does not render an "in {folder}" subtitle duplicating the breadcrumb\'s parent-folder crumb', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.queryByText(/^in transferencias$/i)).not.toBeInTheDocument()
  })

  it('does not repeat the case title as the trailing breadcrumb crumb — it already appears as the heading', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(within(nav).queryByText('Daily transfer limit')).not.toBeInTheDocument()
    expect(within(nav).getByText('Transferencias')).toBeInTheDocument()
  })

  it('does not render a Close button competing with Edit — the back link handles leaving the page', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument()
  })

  it('shows steps read-only and suite membership as a property', async () => {
    mockDetailAPI()
    renderDetail()
    expect(await screen.findByText('Start a transfer over the limit')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^action for step/i)).not.toBeInTheDocument()
    expect(screen.getByText('Smoke')).toBeInTheDocument()
  })

  it('renders step action text at readable body size with clear weight, not text-sm', async () => {
    mockDetailAPI()
    renderDetail()
    const action = await screen.findByText('Start a transfer over the limit')
    expect(action).toHaveClass('text-base', 'font-medium')
  })

  it('labels the expected result with the app\'s own label typography, in brand teal', async () => {
    mockDetailAPI()
    renderDetail()
    const label = await screen.findByText('Expected:')
    expect(label).toHaveClass('tp-label', 'text-primary')
    expect(screen.getByText('Blocked before confirming')).toBeInTheDocument()
  })

  it('renders the expected result at the same readable size as the action, in a soft tinted callout to distinguish it', async () => {
    mockDetailAPI()
    renderDetail()
    const value = await screen.findByText('Blocked before confirming')
    const line = value.closest('p')
    expect(line).toHaveClass('text-base')
    const callout = value.closest('div')
    expect(callout).toHaveClass('bg-primary/5', 'border-primary/20', 'rounded-lg')
  })

  it('gives the step badge a soft flat teal tint, not a gradient', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByText('Start a transfer over the limit')
    const badge = screen.getByTestId('step-number-0')
    expect(badge).toHaveClass('bg-primary/10', 'text-primary')
  })

  it('gives each step a numbered badge with visible text content', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByText('Start a transfer over the limit')
    expect(screen.getByTestId('step-number-0')).toHaveTextContent('1')
  })

  it('bounds the populated steps list in a card, not bare text in open space', async () => {
    mockDetailAPI()
    renderDetail()
    const step = await screen.findByText('Start a transfer over the limit')
    expect(step.closest('[data-slot="card"]')).not.toBeNull()
  })

  it('gives the sidebar a filled panel background so a short steps column reads as a pane, not empty space', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.getByTestId('case-sidebar')).toHaveClass('md:bg-muted/60')
  })

  it('keeps the sidebar in view (sticky) so it stays reachable while scrolling a long steps list', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.getByTestId('case-sidebar')).toHaveClass('md:sticky', 'md:top-6', 'md:self-start')
  })

  it('shows a real empty state with a call to action when a case has no steps', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/folders')
        return Promise.resolve({ data: [root, transferencias], response: { ok: true } })
      if (path === '/api/v1/cases/{caseKey}')
        return Promise.resolve({
          data: { ...limitCase, content: { ...limitCase.content, steps: [] } },
          response: { ok: true },
        })
      if (path === '/api/v1/cases/{caseKey}/versions')
        return Promise.resolve({
          data: [{ caseId: 'c1', version: 1, content: limitCase.content, createdAt: '2026-01-01T00:00:00Z' }],
          response: { ok: true },
        })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })

    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument()
    expect(screen.queryByText('No steps defined.')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /add steps/i }))
    expect(screen.getByLabelText(/^title$/i)).toBeInTheDocument()
  })

  it('lists version history with the current version marked', async () => {
    mockDetailAPI()
    renderDetail()
    const history = await screen.findByRole('list', { name: /version history/i })
    expect(within(history).getByText('v2')).toBeInTheDocument()
    expect(within(history).getByText('v1')).toBeInTheDocument()
    expect(within(history).getByText(/current/i)).toBeInTheDocument()
  })

  it('shows a change signal for each version row, derived from the previous version', async () => {
    mockDetailAPI({ v1Content: { ...limitCase.content, title: 'Daily transfer limit (draft)' } })
    renderDetail()
    const history = await screen.findByRole('list', { name: /version history/i })
    expect(within(history).getByText(/initial version/i)).toBeInTheDocument()
    expect(within(history).getByText(/title changed/i)).toBeInTheDocument()
  })

  it('clicking a version row expands an inline diff without opening a dialog', async () => {
    mockDetailAPI({ v1Content: { ...limitCase.content, title: 'Daily transfer limit (draft)' } })
    renderDetail()
    const history = await screen.findByRole('list', { name: /version history/i })
    await userEvent.click(within(history).getByText('v2'))
    expect(await within(history).findByText('Daily transfer limit (draft)')).toBeInTheDocument()
    expect(within(history).getByText('Daily transfer limit')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(within(history).getByText('v2'))
    expect(screen.queryByText('Daily transfer limit (draft)')).not.toBeInTheDocument()
  })

  it('opens the version detail dialog with execution history from the expanded row', async () => {
    mockDetailAPI()
    renderDetail()
    const history = await screen.findByRole('list', { name: /version history/i })
    await userEvent.click(within(history).getByText('v1'))
    await userEvent.click(await within(history).findByRole('button', { name: /view executions/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('Version 1')).toBeInTheDocument()
  })

  it("folds the version author's avatar and first name into the signal line", async () => {
    mockDetailAPI({
      versions: [
        { caseId: 'c1', version: 1, content: limitCase.content, actorKind: 'unknown', createdAt: '2026-01-01T00:00:00Z' },
        {
          caseId: 'c1',
          version: 2,
          content: limitCase.content,
          actorKind: 'user',
          actorRefId: 'u1',
          createdAt: '2026-02-01T00:00:00Z',
        },
      ],
      users: [
        { id: 'u1', email: 'jane.doe@example.com', isTenantAdmin: false, displayName: 'Jane Doe', avatarKey: null, createdAt: '' },
      ],
    })
    renderDetail()
    const history = await screen.findByRole('list', { name: /version history/i })
    const v2Row = within(history).getByText('v2').closest('button')
    expect(v2Row).not.toBeNull()
    expect(within(v2Row!).getByText('Jane')).toBeInTheDocument()
    expect(within(v2Row!).getByText('Jane')).toHaveAttribute('title', 'Jane Doe')
    expect(v2Row!.querySelector('.size-4')).not.toBeNull()
    const v1Row = within(history).getByText('v1').closest('button')
    expect(v1Row).not.toBeNull()
    expect(within(v1Row!).queryByText('Jane')).not.toBeInTheDocument()
  })

  it('shows no avatar for a version with an unknown actor', async () => {
    mockDetailAPI()
    renderDetail()
    const history = await screen.findByRole('list', { name: /version history/i })
    const v1Row = within(history).getByText('v1').closest('button')
    expect(v1Row).not.toBeNull()
    expect(v1Row!.querySelector('.size-4')).toBeNull()
  })

  it('does not repeat the version author in the expanded diff panel', async () => {
    mockDetailAPI({
      versions: [
        { caseId: 'c1', version: 1, content: limitCase.content, actorKind: 'unknown', createdAt: '2026-01-01T00:00:00Z' },
        {
          caseId: 'c1',
          version: 2,
          content: { ...limitCase.content, title: 'Daily transfer limit (v2)' },
          actorKind: 'user',
          actorRefId: 'u1',
          createdAt: '2026-02-01T00:00:00Z',
        },
      ],
      users: [
        { id: 'u1', email: 'jane.doe@example.com', isTenantAdmin: false, displayName: 'Jane Doe', avatarKey: null, createdAt: '' },
      ],
    })
    renderDetail()
    const history = await screen.findByRole('list', { name: /version history/i })
    await userEvent.click(within(history).getByText('v2'))
    await within(history).findByText('Daily transfer limit (v2)')
    const v2Row = within(history).getByText('v2').closest('li')!
    expect(within(v2Row).getAllByText('Jane')).toHaveLength(1)
  })

  it('renders priority, platform, test type, and automated status as pills', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.getByText('Test type')).toBeInTheDocument()
    expect(screen.getByText('e2e')).toHaveClass('rounded-full')
    expect(screen.getByText('Automation')).toBeInTheDocument()
    expect(screen.getByText('Auto')).toHaveClass('rounded-full')
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('high')).toHaveClass('rounded-full')
    expect(screen.getByText('web')).toHaveClass('rounded-full')
  })

  it('renders tags as individual pill chips, not comma-joined text', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.getByText('smoke')).toHaveClass('rounded-full')
    expect(screen.getByText('regression')).toHaveClass('rounded-full')
    expect(screen.queryByText('smoke, regression')).not.toBeInTheDocument()
  })

  it('renders suite memberships as individual pill chips', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.getByText('Smoke')).toHaveClass('rounded-full')
  })

  it('renders the Results section empty state', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.getByText('Results')).toBeInTheDocument()
    expect(screen.getByText(/no result history yet/i)).toBeInTheDocument()
  })

  it('shows the sidebar sections as expandable, closed groups below 768px', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(min-width: 768px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    const propertiesGroup = screen.getByText('Properties').closest('details')
    expect(propertiesGroup).not.toBeNull()
    expect(propertiesGroup).not.toHaveAttribute('open')
  })

  it('editing and saving creates a new version', async () => {
    mockDetailAPI()
    mockPUT.mockResolvedValue({
      data: { ...limitCase, currentVersion: 3 },
      response: { ok: true },
    })
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    const actionInput = screen.getByLabelText(/^action for step 1/i)
    await userEvent.clear(actionInput)
    await userEvent.type(actionInput, 'Start a transfer above the daily limit')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/cases/{caseKey}',
        expect.objectContaining({
          params: { path: { caseKey: 'c1' } },
          body: expect.objectContaining({
            title: 'Daily transfer limit',
            steps: [{ action: 'Start a transfer above the daily limit', expected: 'Blocked before confirming' }],
          }),
        }),
      )
    })
  })

  it('entering edit mode keeps Results and Version History visible, and turns Properties into an inline form', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))

    expect(screen.getByText('Results')).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: /version history/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^priority$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^automated$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^platform$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^test type$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument()
    expect(screen.queryByText('In suites')).not.toBeInTheDocument()
  })

  it('opens a header actions menu offering Move to… and Delete', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    await userEvent.click(screen.getByRole('button', { name: /actions for daily transfer limit/i }))
    expect(screen.getByRole('menuitem', { name: /move to…/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('Move to… opens the folder picker and moving calls the existing move endpoint', async () => {
    mockDetailAPI()
    mockPUT.mockResolvedValue({ data: limitCase, response: { ok: true } })
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    await userEvent.click(screen.getByRole('button', { name: /actions for daily transfer limit/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /move to…/i }))
    const moveDialog = await screen.findByRole('dialog', { name: /move to…/i })
    await userEvent.click(within(moveDialog).getByText('Library'))
    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/cases/{caseKey}/folder',
        expect.objectContaining({
          params: { path: { caseKey: 'c1' } },
          body: { folderId: 'root' },
        }),
      )
    })
  })

  it('Delete opens a confirmation and, on confirm, deletes the case and returns to the Library', async () => {
    mockDetailAPI()
    mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    await userEvent.click(screen.getByRole('button', { name: /actions for daily transfer limit/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))
    expect(await screen.findByRole('heading', { name: /delete case\?/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^delete case$/i }))
    await waitFor(() => {
      expect(mockDELETE).toHaveBeenCalledWith('/api/v1/cases/{caseKey}', {
        params: { path: { caseKey: 'c1' } },
      })
    })
    expect(await screen.findByTestId('library-probe')).toHaveTextContent('library')
  })

  it('refreshes the version history after saving an edit', async () => {
    let saved = false
    mockGET.mockImplementation((path: string, options?: { params?: { path?: Record<string, string> } }) => {
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}/folders')
        return Promise.resolve({ data: [root, transferencias], response: { ok: true } })
      if (path === '/api/v1/cases/{caseKey}' && options?.params?.path?.caseKey === 'c1')
        return Promise.resolve({
          data: saved ? { ...limitCase, currentVersion: 3 } : limitCase,
          response: { ok: true },
        })
      if (path === '/api/v1/cases/{caseKey}/versions' && options?.params?.path?.caseKey === 'c1')
        return Promise.resolve({
          data: saved
            ? [
                { caseId: 'c1', version: 1, content: limitCase.content, createdAt: '2026-01-01T00:00:00Z' },
                { caseId: 'c1', version: 2, content: limitCase.content, createdAt: '2026-02-01T00:00:00Z' },
                { caseId: 'c1', version: 3, content: limitCase.content, createdAt: '2026-03-01T00:00:00Z' },
              ]
            : [{ caseId: 'c1', version: 1, content: limitCase.content, createdAt: '2026-01-01T00:00:00Z' }],
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectKey}/suites')
        return Promise.resolve({ data: [], response: { ok: true } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    mockPUT.mockImplementation(() => {
      saved = true
      return Promise.resolve({ data: { ...limitCase, currentVersion: 3 }, response: { ok: true } })
    })

    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    const history = await screen.findByRole('list', { name: /version history/i })
    expect(await within(history).findByText('v3')).toBeInTheDocument()
  })
})
