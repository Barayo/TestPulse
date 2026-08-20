import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import CaseDetailPage from './CaseDetailPage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), POST: vi.fn() },
}))
const mockGET = vi.mocked(api.GET)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)
const mockPOST = vi.mocked(api.POST)

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
// membership at all (design.md D11 distinguishes the two: a `null`/failed
// permissions fetch now means "not a member", handled by its own branch).
const noPermissions = { ...fullPermissions, ...Object.fromEntries(Object.keys(fullPermissions).map((k) => [k, false])), read: true }

function mockDetailAPI(options?: {
  v1Content?: typeof limitCase.content
  versions?: unknown[]
  users?: unknown[]
  executions?: unknown[]
  customFields?: unknown[]
  // Patches the *current* case's own content.customFields — separate from
  // v1Content/versions, which only affect the version-history list.
  currentCustomFieldValues?: Record<string, string>
  // pass `null` (not `undefined` — a default parameter would silently
  // override it) to simulate no permissions data at all.
  permissions?: unknown
  // No session — the dual-mode branch (unify-authenticated-and-public-views
  // tasks.md 4.1) reads from /api/v1/public/... instead. A real anonymous
  // request also has no permissions and never calls GET /api/v1/users
  // (D10) — both are true automatically here since `permissions` isn't
  // separately overridden and the public-branch paths below never include
  // /api/v1/users.
  anonymous?: boolean
}) {
  const anon = options?.anonymous ?? false
  mockGET.mockImplementation((path: string, opts?: { params?: { path?: Record<string, string> } }) => {
    if (path === '/api/v1/users/me')
      return anon
        ? Promise.resolve({ data: undefined, response: { ok: false } })
        : Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    const projectPath = anon ? '/api/v1/public/projects/{projectKey}' : '/api/v1/projects/{projectKey}'
    const foldersPath = anon ? '/api/v1/public/projects/{projectKey}/folders' : '/api/v1/projects/{projectKey}/folders'
    const casePath = anon ? '/api/v1/public/cases/{caseKey}' : '/api/v1/cases/{caseKey}'
    const versionsPath = anon ? '/api/v1/public/cases/{caseKey}/versions' : '/api/v1/cases/{caseKey}/versions'
    const suitesPath = anon ? '/api/v1/public/projects/{projectKey}/suites' : '/api/v1/projects/{projectKey}/suites'
    const executionsPath = anon ? '/api/v1/public/cases/{caseKey}/executions' : '/api/v1/cases/{caseKey}/executions'
    const customFieldsPath = anon
      ? '/api/v1/public/projects/{projectKey}/custom-fields'
      : '/api/v1/projects/{projectKey}/custom-fields'
    if (path === projectPath)
      return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
    if (path === foldersPath)
      return Promise.resolve({ data: [root, transferencias], response: { ok: true } })
    if (path === casePath && opts?.params?.path?.caseKey === 'c1')
      return Promise.resolve({
        data: options?.currentCustomFieldValues
          ? { ...limitCase, content: { ...limitCase.content, customFields: options.currentCustomFieldValues } }
          : limitCase,
        response: { ok: true },
      })
    if (path === versionsPath && opts?.params?.path?.caseKey === 'c1')
      return Promise.resolve({
        data: options?.versions ?? [
          { caseId: 'c1', version: 1, content: options?.v1Content ?? limitCase.content, actorKind: 'unknown', createdAt: '2026-01-01T00:00:00Z' },
          { caseId: 'c1', version: 2, content: limitCase.content, actorKind: 'unknown', createdAt: '2026-02-01T00:00:00Z' },
        ],
        response: { ok: true },
      })
    if (path === suitesPath)
      return Promise.resolve({
        data: [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
        response: { ok: true },
      })
    if (path === executionsPath) return Promise.resolve({ data: options?.executions ?? [], response: { ok: true } })
    if (path === customFieldsPath) return Promise.resolve({ data: options?.customFields ?? [], response: { ok: true } })
    if (path === '/api/v1/users' && !anon) return Promise.resolve({ data: options?.users ?? [], response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions' && !anon) {
      const permissions = options && 'permissions' in options ? options.permissions : fullPermissions
      return Promise.resolve({ data: permissions === null ? undefined : permissions, response: { ok: true } })
    }
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
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/cases/:caseKey" element={<CaseDetailPage />} />
          <Route path="/projects/:projectKey/library" element={<LibraryProbe />} />
          <Route path="/projects/:projectKey/library/:folderId" element={<LibraryProbe />} />
          <Route path="/login" element={<p>login stub</p>} />
        </Routes>
      </AuthProvider>
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
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
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
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
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
      if (path === '/api/v1/projects/{projectKey}/permissions')
        return Promise.resolve({ data: fullPermissions, response: { ok: true } })
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

  describe('Restore version (add-version-restore)', () => {
    it('shows a Restore action for a non-current version but not the current one', async () => {
      mockDetailAPI()
      renderDetail()
      const history = await screen.findByRole('list', { name: /version history/i })
      await userEvent.click(within(history).getByText('v1'))
      expect(await within(history).findByRole('button', { name: /restore this version/i })).toBeInTheDocument()

      await userEvent.click(within(history).getByText('v1'))
      await userEvent.click(within(history).getByText('v2'))
      expect(within(history).queryByRole('button', { name: /restore this version/i })).not.toBeInTheDocument()
    })

    it('hides the Restore action when the caller lacks caseEdit', async () => {
      mockDetailAPI({ permissions: { ...fullPermissions, caseEdit: false } })
      renderDetail()
      const history = await screen.findByRole('list', { name: /version history/i })
      await userEvent.click(within(history).getByText('v1'))
      expect(within(history).queryByRole('button', { name: /restore this version/i })).not.toBeInTheDocument()
    })

    it('hides the Restore action for an anonymous/public visitor', async () => {
      mockDetailAPI({ anonymous: true })
      renderDetail()
      const history = await screen.findByRole('list', { name: /version history/i })
      await userEvent.click(within(history).getByText('v1'))
      expect(within(history).queryByRole('button', { name: /restore this version/i })).not.toBeInTheDocument()
    })

    it('shows a confirmation before restoring, and confirming calls the restore endpoint', async () => {
      mockDetailAPI()
      mockPOST.mockResolvedValue({
        data: { ...limitCase, currentVersion: 3, content: { ...limitCase.content, title: 'Daily transfer limit v1 restored' } },
        response: { ok: true },
      })
      renderDetail()
      const history = await screen.findByRole('list', { name: /version history/i })
      await userEvent.click(within(history).getByText('v1'))
      await userEvent.click(await within(history).findByRole('button', { name: /restore this version/i }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/restore version 1/i)).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: /^restore$/i }))

      await waitFor(() => {
        expect(mockPOST).toHaveBeenCalledWith(
          '/api/v1/cases/{caseKey}/versions/{version}/restore',
          expect.objectContaining({ params: { path: { caseKey: 'c1', version: 1 } } }),
        )
      })
    })
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

  it('wires real execution history into the Results section, most recent last', async () => {
    // API returns order=recent (most-recent-first); the page must present
    // the bars oldest→newest (most recent last), matching CaseResultsPanel's
    // own "last bar = most recent" convention.
    mockDetailAPI({
      executions: [
        { runItemId: 'i3', runId: 'r3', runKey: 'R-3', runName: 'run 3', caseVersion: 2, status: 'pass', createdAt: '2026-07-20T10:00:00Z' },
        { runItemId: 'i2', runId: 'r2', runKey: 'R-2', runName: 'run 2', caseVersion: 2, status: 'failed', createdAt: '2026-07-19T10:00:00Z' },
        { runItemId: 'i1', runId: 'r1', runKey: 'R-1', runName: 'run 1', caseVersion: 1, status: 'pass', createdAt: '2026-07-18T10:00:00Z' },
      ],
    })
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })

    expect(screen.queryByText(/no result history yet/i)).not.toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()

    const bars = screen.getAllByTestId('case-result-bar')
    expect(bars).toHaveLength(3)
    expect(bars[0]).toHaveAttribute('aria-label', expect.stringContaining('Pass'))
    expect(bars[1]).toHaveAttribute('aria-label', expect.stringContaining('Failed'))
    expect(bars[2]).toHaveAttribute('aria-label', expect.stringContaining('Pass'))

    const lastRun = new Date('2026-07-20T10:00:00Z').toLocaleDateString()
    expect(screen.getByText(new RegExp(`Last run.*${lastRun.replace(/\//g, '\\/')}`))).toBeInTheDocument()
  })

  it('orders sidebar sections Properties → Results → Version history', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    const sidebar = screen.getByTestId('case-sidebar')
    const sectionTitles = Array.from(sidebar.querySelectorAll('summary')).map((el) => el.textContent)
    expect(sectionTitles).toEqual(['Properties', 'Results', 'Version history'])
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

  it('editing a custom field value and saving includes it in the request', async () => {
    mockDetailAPI({
      customFields: [{ id: 'f1', name: 'Automation Owner', fieldType: 'text', createdAt: '' }],
    })
    mockPUT.mockResolvedValue({ data: { ...limitCase, currentVersion: 3 }, response: { ok: true } })
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await userEvent.type(screen.getByLabelText('Automation Owner'), 'ana')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/cases/{caseKey}',
        expect.objectContaining({
          params: { path: { caseKey: 'c1' } },
          body: expect.objectContaining({ customFields: { f1: 'ana' } }),
        }),
      )
    })
  })

  it('shows custom field values in the read-only Properties sidebar, select as a pill and text as plain text', async () => {
    mockDetailAPI({
      customFields: [
        { id: 'f1', name: 'Automation Owner', fieldType: 'text', createdAt: '' },
        { id: 'f2', name: 'Component', fieldType: 'select', options: [{ id: 'o1', value: 'API' }], createdAt: '' },
      ],
      currentCustomFieldValues: { f1: 'ana', f2: 'o1' },
    })
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })

    const sidebar = screen.getByTestId('case-sidebar')
    expect(within(sidebar).getByText('ana')).toBeInTheDocument()
    expect(within(sidebar).getByText('API')).toHaveClass('rounded-full')
  })

  it('caps custom fields at 3 in the sidebar, collapsing the rest behind "Show N more"', async () => {
    const defs = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ id: `f${i}`, name, fieldType: 'text' as const, createdAt: '' }))
    const values = Object.fromEntries(defs.map((d) => [d.id, `val-${d.name}`]))
    mockDetailAPI({ customFields: defs, currentCustomFieldValues: values })
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })

    const sidebar = screen.getByTestId('case-sidebar')
    expect(within(sidebar).getByText('val-A')).toBeInTheDocument()
    expect(within(sidebar).getByText('val-B')).toBeInTheDocument()
    expect(within(sidebar).getByText('val-C')).toBeInTheDocument()
    expect(within(sidebar).queryByText('val-D')).not.toBeInTheDocument()
    const disclosure = within(sidebar).getByText(/show 2 more/i)
    expect(disclosure).toBeInTheDocument()

    await userEvent.click(disclosure)
    expect(within(sidebar).getByText('val-D')).toBeInTheDocument()
    expect(within(sidebar).getByText('val-E')).toBeInTheDocument()
  })

  it('a project with no custom fields shows the sidebar unchanged', async () => {
    mockDetailAPI({ customFields: [] })
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.queryByText(/show \d+ more/i)).not.toBeInTheDocument()
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
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
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
      if (path === '/api/v1/projects/{projectKey}/permissions')
        return Promise.resolve({ data: fullPermissions, response: { ok: true } })
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

  // Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
  // tasks.md 2.3): a caller without the matching permission must not see
  // the write controls at all — since this page will also render for
  // anonymous visitors on a public project.
  describe('permission gating', () => {
    it('hides Edit and "+ Add steps" when the caller lacks caseEdit', async () => {
      mockDetailAPI({ permissions: { ...fullPermissions, caseEdit: false } })
      renderDetail()
      await screen.findByRole('heading', { name: 'Daily transfer limit' })
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    })

    it('omits Move to… from the actions menu when the caller lacks caseEdit', async () => {
      mockDetailAPI({ permissions: { ...fullPermissions, caseEdit: false } })
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: /actions for daily transfer limit/i }))
      expect(screen.queryByRole('menuitem', { name: /move to/i })).not.toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument()
    })

    it('omits Delete from the actions menu when the caller lacks caseDelete', async () => {
      mockDetailAPI({ permissions: { ...fullPermissions, caseDelete: false } })
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: /actions for daily transfer limit/i }))
      expect(screen.queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /move to/i })).toBeInTheDocument()
    })

    it('renders no actions trigger at all, and no Edit button, when the caller has no permissions', async () => {
      mockDetailAPI({ permissions: noPermissions })
      renderDetail()
      await screen.findByRole('heading', { name: 'Daily transfer limit' })
      expect(screen.queryByRole('button', { name: /actions for daily transfer limit/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    })
  })

  // Dual-mode migration (unify-authenticated-and-public-views tasks.md
  // group 4).
  describe('anonymous / dual-mode', () => {
    it('fetches from the public API when there is no session', async () => {
      mockDetailAPI({ anonymous: true })
      renderDetail()
      await screen.findByRole('heading', { name: 'Daily transfer limit' })
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/cases/{caseKey}', expect.anything())
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/cases/{caseKey}', expect.anything())
    })

    it('renders the identical case detail a member sees, with zero write controls', async () => {
      mockDetailAPI({ anonymous: true })
      renderDetail()
      await screen.findByRole('heading', { name: 'Daily transfer limit' })
      expect(screen.getByText('high')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /actions for daily transfer limit/i })).not.toBeInTheDocument()
    })

    // D10: GET /api/v1/users has no public equivalent and must never be
    // called anonymously — version-history rows show no author name
    // rather than exposing the instance's user directory.
    it('never calls GET /api/v1/users, and omits the author name from version history, when anonymous', async () => {
      mockDetailAPI({
        anonymous: true,
        versions: [
          { caseId: 'c1', version: 1, content: limitCase.content, actorKind: 'user', actorRefId: 'u1', createdAt: '2026-01-01T00:00:00Z' },
        ],
      })
      renderDetail()
      await screen.findByRole('list', { name: /version history/i })
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/users')
      expect(screen.queryByText('admin@example.com')).not.toBeInTheDocument()
    })

    it('fires no request while the session check is still in flight', async () => {
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') return new Promise(() => {}) // never resolves
        return Promise.resolve({ data: undefined, response: { ok: true } })
      })
      renderDetail()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/cases/{caseKey}', expect.anything())
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/public/cases/{caseKey}', expect.anything())
    })

    it('shows a "Log in" link alongside "Go to Library" when a case is not found anonymously', async () => {
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') return Promise.resolve({ data: undefined, response: { ok: false } })
        if (path === '/api/v1/public/cases/{caseKey}')
          return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
        return Promise.resolve({ data: undefined, response: { ok: true } })
      })
      renderDetail()
      expect(await screen.findByText(/case not found/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument()
    })
  })

  // design.md D11: a signed-in user with no membership on a public
  // project gets 403 from every authenticated route (including
  // /permissions, which useProjectReadAccess itself checks) — the page
  // must fall back to the public branch instead of showing "not found",
  // exactly like an anonymous visitor would see.
  describe('signed-in non-member (design.md D11)', () => {
    it('falls back to the public API and renders the case instead of "not found"', async () => {
      mockGET.mockImplementation((path: string, opts?: { params?: { path?: Record<string, string> } }) => {
        if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
        if (path === '/api/v1/projects/{projectKey}/permissions')
          return Promise.resolve({ data: undefined, response: { ok: false } })
        if (path === '/api/v1/public/projects/{projectKey}')
          return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
        if (path === '/api/v1/public/projects/{projectKey}/folders')
          return Promise.resolve({ data: [root, transferencias], response: { ok: true } })
        if (path === '/api/v1/public/cases/{caseKey}' && opts?.params?.path?.caseKey === 'c1')
          return Promise.resolve({ data: limitCase, response: { ok: true } })
        if (path === '/api/v1/public/cases/{caseKey}/versions' && opts?.params?.path?.caseKey === 'c1')
          return Promise.resolve({
            data: [{ caseId: 'c1', version: 1, content: limitCase.content, actorKind: 'unknown', createdAt: '2026-01-01T00:00:00Z' }],
            response: { ok: true },
          })
        if (path === '/api/v1/public/projects/{projectKey}/suites') return Promise.resolve({ data: [], response: { ok: true } })
        return Promise.resolve({ data: undefined, response: { ok: false } })
      })
      renderDetail()
      expect(await screen.findByRole('heading', { name: 'Daily transfer limit' })).toBeInTheDocument()
      expect(screen.queryByText(/case not found/i)).not.toBeInTheDocument()
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/cases/{caseKey}', expect.anything())
      // D10 must hold for a signed-in non-member exactly as it does for an
      // anonymous visitor — GET /api/v1/users (the unscoped identity
      // directory) must never fire on the public/non-member branch.
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/users')
    })
  })
})
