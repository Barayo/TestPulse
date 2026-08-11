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
) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me')
      return anonymous
        ? Promise.resolve({ data: undefined, response: { ok: false } })
        : Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    const projectPath = anonymous ? '/api/v1/public/projects/{projectKey}' : '/api/v1/projects/{projectKey}'
    const casesPath = anonymous ? '/api/v1/public/projects/{projectKey}/cases' : '/api/v1/projects/{projectKey}/cases'
    const foldersPath = anonymous ? '/api/v1/public/projects/{projectKey}/folders' : '/api/v1/projects/{projectKey}/folders'
    const suitePath = anonymous ? '/api/v1/public/suites/{suiteKey}' : '/api/v1/suites/{suiteKey}'
    if (path === projectPath) return Promise.resolve({ data: projectQA, response: { ok: true } })
    if (path === casesPath) return Promise.resolve({ data: cases, response: { ok: true } })
    if (path === foldersPath) return Promise.resolve({ data: folders, response: { ok: true } })
    if (path === suitePath) return Promise.resolve({ data: suite, response: { ok: true } })
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

  it('shows the case grid pre-checked with current members', async () => {
    mockDetailAPI()
    renderDetail()
    expect(await screen.findByRole('checkbox', { name: /login works/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /checkout works/i })).not.toBeChecked()
  })

  it('shows sidebar properties: case count, pass rate, last run, created', async () => {
    mockDetailAPI()
    renderDetail()
    const sidebar = within(await screen.findByTestId('suite-sidebar'))
    expect(sidebar.getByText('1')).toBeInTheDocument() // case count
    expect(sidebar.getByText('90%')).toBeInTheDocument()
  })

  it('shows "Never run" in the sidebar for a suite with no runs', async () => {
    mockDetailAPI({ ...smokeSuite, passRate: null, lastRunAt: null })
    renderDetail()
    expect(await screen.findAllByText(/never run/i)).not.toHaveLength(0)
  })

  it('scopes the case grid to a section using the project\'s real folder hierarchy', async () => {
    mockDetailAPI()
    renderDetail()

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

  it('shows an inline confirmation banner with a link to the new run after Run suite', async () => {
    mockDetailAPI()
    mockPOST.mockResolvedValue({
      data: { id: 'r1', key: 'p1-R1', projectId: 'p1', name: 'Smoke run', createdAt: '' },
      response: { ok: true },
    })
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: /run suite/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create run$/i }))

    expect(await screen.findByText(/run created/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /view run/i })
    expect(link).toHaveAttribute('href', '/runs/p1-R1')
  })

  // Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
  // tasks.md 2.1/2.2): a caller without the matching permission must not
  // see the write controls at all — not disabled, absent — since this page
  // will also render for anonymous visitors on a public project.
  it('hides Run suite/Rename/Delete and disables the case picker for a caller with no permissions', async () => {
    // read: true (a real member always has it — the /permissions endpoint
    // itself requires it, design.md D11) with everything else false, not
    // `null`: a signed-in caller who can reach this page at all has
    // necessarily passed a PermRead check somewhere, so "no permissions"
    // realistically means a maximally-restrictive role, not a failed
    // permissions fetch (which design.md D11 now treats as a distinct,
    // non-member case with its own test below).
    mockDetailAPI(smokeSuite, [case1, case2], noPermissions)
    renderDetail()

    expect(await screen.findByRole('checkbox', { name: /login works/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /run suite/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
  })

  it('shows only the case list, still selected correctly, when read-only', async () => {
    mockDetailAPI(smokeSuite, [case1, case2], { ...fullPermissions, suiteEditMembership: false })
    renderDetail()

    expect(await screen.findByRole('checkbox', { name: /login works/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /login works/i })).toBeDisabled()
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
      expect(await screen.findByRole('checkbox', { name: /login works/i })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: /login works/i })).toBeDisabled()
      expect(screen.queryByRole('button', { name: /run suite/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
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
        return Promise.resolve({ data: undefined, response: { ok: false } })
      })
      renderDetail()
      expect(await screen.findByRole('heading', { name: 'Smoke' })).toBeInTheDocument()
      expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
    })
  })
})
