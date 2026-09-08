import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import FolderExplorerPage from './FolderExplorerPage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

// jsdom has no real drag-and-drop; the standard pattern is driving the
// handlers directly with a minimal DataTransfer stub.
function makeDataTransfer() {
  const store: Record<string, string> = {}
  return {
    setData: (type: string, data: string) => {
      store[type] = data
    },
    getData: (type: string) => store[type] ?? '',
  }
}

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

const allPermissions = {
  read: true,
  caseCreate: true,
  caseEdit: true,
  caseDelete: true,
  sectionCreate: true,
  sectionEdit: true,
  sectionDelete: true,
  suiteCreate: true,
  suiteEditMembership: true,
  runCreate: true,
  runRecordResult: true,
  manageProject: true,
}

const root = { id: 'root', projectId: 'p1', name: 'Root', createdAt: '' }
const transferencias = { id: 'transferencias', projectId: 'p1', parentFolderId: 'root', name: 'Transferencias', createdAt: '' }
const nacionales = { id: 'nacionales', projectId: 'p1', parentFolderId: 'transferencias', name: 'Nacionales', createdAt: '' }

const limitCase = {
  id: 'c1',
  key: 'c1',
  projectId: 'p1',
  folderId: 'transferencias',
  currentVersion: 2,
  content: {
    title: 'Daily transfer limit',
    description: 'Ensures over-threshold transfers are blocked',
    steps: [{ action: 'Start a transfer over the limit', expected: 'Blocked' }],
    expectedResult: 'Transfer blocked',
    priority: 'high',
    tags: ['smoke'],
    platform: 'web',
    testType: 'e2e',
    automated: true,
  },
  createdAt: '',
}

const authenticatedUser = { id: 'u1', email: 'admin@example.com', isTenantAdmin: false }

// overrides.anonymous: true simulates no session — reads from
// /api/v1/public/... instead (unify-authenticated-and-public-views
// tasks.md 9.1).
function mockExplorerAPI(overrides: Partial<Record<string, unknown>> = {}) {
  const anon = Boolean(overrides.anonymous)
  mockGET.mockImplementation((path: string, options?: { params?: { path?: Record<string, string> } }) => {
    if (path === '/api/v1/users/me')
      return anon
        ? Promise.resolve({ data: undefined, response: { ok: false } })
        : Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    const projectPath = anon ? '/api/v1/public/projects/{projectKey}' : '/api/v1/projects/{projectKey}'
    const foldersPath = anon ? '/api/v1/public/projects/{projectKey}/folders' : '/api/v1/projects/{projectKey}/folders'
    const casesPath = anon ? '/api/v1/public/projects/{projectKey}/cases' : '/api/v1/projects/{projectKey}/cases'
    const suitesPath = anon ? '/api/v1/public/projects/{projectKey}/suites' : '/api/v1/projects/{projectKey}/suites'
    const flakyPath = anon ? '/api/v1/public/projects/{projectKey}/flaky-cases' : '/api/v1/projects/{projectKey}/flaky-cases'
    if (path === projectPath)
      return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
    if (path === foldersPath)
      return Promise.resolve({
        data: { items: overrides.folders ?? [root, transferencias, nacionales], nextCursor: null },
        response: { ok: true },
      })
    if (path === casesPath)
      return Promise.resolve({ data: { items: overrides.cases ?? [limitCase], nextCursor: null }, response: { ok: true } })
    if (path === suitesPath)
      return Promise.resolve({
        data: {
          items: overrides.suites ?? [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
          nextCursor: null,
        },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/permissions' && !anon)
      return Promise.resolve({ data: overrides.permissions ?? allPermissions, response: { ok: true } })
    if (path === flakyPath)
      return Promise.resolve({ data: overrides.flakyCases ?? [], response: { ok: true } })
    if (path === '/api/v1/cases/{caseKey}/versions' && options?.params?.path?.caseKey === 'c1')
      return Promise.resolve({
        data: [
          { caseId: 'c1', version: 1, content: limitCase.content, createdAt: '2026-01-01T00:00:00Z' },
          { caseId: 'c1', version: 2, content: limitCase.content, createdAt: '2026-02-01T00:00:00Z' },
        ],
        response: { ok: true },
      })
    if (path === '/api/v1/folders/{folderId}/delete-preview')
      return Promise.resolve({
        data: (overrides.deletePreview as Record<string, unknown>) ?? { caseCount: 1, folderCount: 0 },
        response: { ok: true },
      })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function CaseDetailProbe() {
  const { caseKey } = useParams<{ caseKey: string }>()
  return <p data-testid="case-detail-probe">case detail for {caseKey}</p>
}

function SuiteDetailProbe() {
  const { suiteKey } = useParams<{ suiteKey: string }>()
  return <p data-testid="suite-detail-probe">suite detail for {suiteKey}</p>
}

function renderExplorer(path = '/projects/p1/library/transferencias') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/projects/:projectKey/library" element={<FolderExplorerPage />} />
          <Route path="/projects/:projectKey/library/:folderId" element={<FolderExplorerPage />} />
          <Route path="/projects/:projectKey/cases/:caseKey" element={<CaseDetailProbe />} />
          <Route path="/projects/:projectKey/suites/:suiteKey" element={<SuiteDetailProbe />} />
          <Route path="/login" element={<p>login stub</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockViewport(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    media: '(min-width: 768px)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  // useMediaQuery('(min-width: 768px)') defaults to matches:false (the
  // shared jsdom matchMedia stub in src/test/setup.ts), which reads as
  // "mobile" for a min-width query — the opposite of useIsMobile's
  // max-width semantics that default was written for. Tests unrelated to
  // responsive behavior assume desktop, matching this page's pre-refactor
  // behavior; the "responsive layout" describe block overrides per test.
  mockViewport(true)
  // jsdom has no scrollIntoView at all — the keyboard-nav effect
  // (add-library-bulk-select) calls it unconditionally whenever a case row
  // is focused, so every test needs the stub, not just the ones about
  // keyboard navigation.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FolderExplorerPage', () => {
  it('shows a not-found message instead of a blank/empty interactive page when the project does not exist or is not accessible', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      if (
        path === '/api/v1/projects/{projectKey}/folders' ||
        path === '/api/v1/projects/{projectKey}/cases' ||
        path === '/api/v1/projects/{projectKey}/suites'
      )
        return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    render(
      <MemoryRouter initialEntries={['/projects/p1/library']}>
        <AuthProvider>
          <Routes>
            <Route path="/projects/:projectKey/library" element={<FolderExplorerPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(screen.queryByText(/new test case/i)).not.toBeInTheDocument()
  })

  it('shows the selected folder’s direct subfolders and cases', async () => {
    mockExplorerAPI()
    renderExplorer()
    const list = await screen.findByRole('list', { name: 'Section contents' })
    expect(within(list).getByText('Nacionales')).toBeInTheDocument()
    expect(within(list).getByText('Daily transfer limit')).toBeInTheDocument()
  })

  it('reflects folder depth in the breadcrumb, with Library as the root crumb — no leading project segment, the header chip covers that', async () => {
    mockExplorerAPI()
    renderExplorer()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).queryByText('Banca Móvil')).not.toBeInTheDocument()
    expect(within(nav).getByText('Library')).toBeInTheDocument()
    expect(within(nav).getByText('Transferencias')).toBeInTheDocument()
  })

  it('shows "Library" as a plain, non-interactive crumb when browsing the root itself — the page has no other heading announcing where you are', async () => {
    mockExplorerAPI()
    renderExplorer('/projects/p1/library/root')
    await screen.findByRole('list', { name: 'Section contents' })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Library')).toBeInTheDocument()
    expect(within(nav).queryByRole('link')).not.toBeInTheDocument()
  })

  it('navigates into a subfolder when clicked', async () => {
    mockExplorerAPI()
    renderExplorer()
    const list = await screen.findByRole('list', { name: 'Section contents' })
    await userEvent.click(within(list).getByText('Nacionales'))
    await waitFor(() => {
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
      expect(within(nav).getByText('Nacionales')).toBeInTheDocument()
    })
  })

  it('creates a folder in the currently open folder without a parent picker', async () => {
    mockExplorerAPI()
    mockPOST.mockResolvedValue({
      data: { id: 'f2', projectId: 'p1', parentFolderId: 'transferencias', name: 'Internacionales', createdAt: '' },
      response: { ok: true },
    })
    renderExplorer()
    await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')
    await userEvent.click(screen.getByRole('button', { name: /^\+ new section$/i }))
    await userEvent.type(screen.getByLabelText(/new section name/i), 'Internacionales{Enter}')

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/folders',
        expect.objectContaining({
          params: { path: { projectKey: 'p1' } },
          body: { name: 'Internacionales', parentFolderId: 'transferencias' },
        }),
      )
    })
  })

  it('creates a subfolder from the tree via right-click without changing the open folder', async () => {
    mockExplorerAPI()
    mockPOST.mockResolvedValue({
      data: { id: 'f3', projectId: 'p1', parentFolderId: 'nacionales', name: 'Returns', createdAt: '' },
      response: { ok: true },
    })
    renderExplorer()
    const tree = await screen.findByRole('navigation', { name: 'Section tree' })
    // Scoped + async: the tree's own expand-ancestors effect lands one
    // render after the content list (which doesn't depend on it) is ready.
    await userEvent.pointer({ keys: '[MouseRight]', target: await within(tree).findByText('Nacionales') })
    await userEvent.click(await screen.findByRole('menuitem', { name: /new section/i }))
    await userEvent.type(screen.getByLabelText(/new section name/i), 'Returns{Enter}')

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/folders',
        expect.objectContaining({ body: { name: 'Returns', parentFolderId: 'nacionales' } }),
      )
    })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Transferencias')).toBeInTheDocument()
  })

  it('links "+ New test case" to the dedicated create-case page, scoped to the open folder', async () => {
    mockExplorerAPI()
    renderExplorer()
    await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')
    const link = screen.getByRole('link', { name: /new test case/i })
    expect(link).toHaveAttribute('href', '/projects/p1/cases/new?folderId=transferencias')
  })

  it('navigates to the case detail route when a case is selected', async () => {
    mockExplorerAPI()
    renderExplorer()
    await userEvent.click(await screen.findByText('Daily transfer limit'))
    expect(await screen.findByTestId('case-detail-probe')).toHaveTextContent('case detail for c1')
  })

  describe('moving a case', () => {
    it('moves a case by dragging it onto a section shown in the tree', async () => {
      mockExplorerAPI()
      mockPUT.mockResolvedValue({ data: undefined, response: { ok: true } })
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      const tree = screen.getByRole('navigation', { name: 'Section tree' })
      const targetNode = within(tree).getByText('Nacionales').closest('div') as HTMLElement

      const dt = makeDataTransfer()
      fireEvent.dragStart(caseRow, { dataTransfer: dt })
      fireEvent.dragOver(targetNode, { dataTransfer: dt })
      fireEvent.drop(targetNode, { dataTransfer: dt })

      await waitFor(() => {
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/cases/{caseKey}/folder',
          expect.objectContaining({ params: { path: { caseKey: 'c1' } }, body: { folderId: 'nacionales' } }),
        )
      })
    })

    it('moves a case by dragging it onto a subsection row shown inline in the content list', async () => {
      mockExplorerAPI()
      mockPUT.mockResolvedValue({ data: undefined, response: { ok: true } })
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      const list = screen.getByRole('list', { name: 'Section contents' })
      const targetRow = within(list).getByText('Nacionales').closest('li') as HTMLElement

      const dt = makeDataTransfer()
      fireEvent.dragStart(caseRow, { dataTransfer: dt })
      fireEvent.dragOver(targetRow, { dataTransfer: dt })
      fireEvent.drop(targetRow, { dataTransfer: dt })

      await waitFor(() => {
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/cases/{caseKey}/folder',
          expect.objectContaining({ params: { path: { caseKey: 'c1' } }, body: { folderId: 'nacionales' } }),
        )
      })
    })

    it('does nothing when a case is dropped onto the section it already belongs to', async () => {
      mockExplorerAPI()
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      const tree = screen.getByRole('navigation', { name: 'Section tree' })
      const currentFolderNode = within(tree).getByText('Transferencias').closest('div') as HTMLElement

      const dt = makeDataTransfer()
      fireEvent.dragStart(caseRow, { dataTransfer: dt })
      fireEvent.dragOver(currentFolderNode, { dataTransfer: dt })
      fireEvent.drop(currentFolderNode, { dataTransfer: dt })

      await new Promise((r) => setTimeout(r, 0))
      expect(mockPUT).not.toHaveBeenCalled()
    })

    it('moves a case via the "Move to…" item in its row menu, listing every folder', async () => {
      mockExplorerAPI()
      mockPUT.mockResolvedValue({ data: undefined, response: { ok: true } })
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /move to/i }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Nacionales')).toBeInTheDocument()
      expect(within(dialog).getByText('Library')).toBeInTheDocument()

      await userEvent.click(within(dialog).getByText('Nacionales'))

      await waitFor(() => {
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/cases/{caseKey}/folder',
          expect.objectContaining({ params: { path: { caseKey: 'c1' } }, body: { folderId: 'nacionales' } }),
        )
      })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('filters the "Move to…" picker list by the search query', async () => {
      mockExplorerAPI()
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /move to/i }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Library')).toBeInTheDocument()
      expect(within(dialog).getByText('Nacionales')).toBeInTheDocument()

      await userEvent.type(within(dialog).getByPlaceholderText(/search sections/i), 'Nacionales')

      expect(within(dialog).queryByText('Library')).not.toBeInTheDocument()
      expect(within(dialog).getByText('Nacionales')).toBeInTheDocument()
    })

    it('does nothing when the current folder is reselected in the picker', async () => {
      mockExplorerAPI()
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /move to/i }))
      const dialog = await screen.findByRole('dialog')

      await userEvent.click(within(dialog).getByText('Transferencias'))

      await new Promise((r) => setTimeout(r, 0))
      expect(mockPUT).not.toHaveBeenCalled()
    })
  })

  describe('responsive layout', () => {
    it('renders both the section tree and the content list side by side at ≥768px', async () => {
      mockViewport(true)
      mockExplorerAPI()
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.getByRole('navigation', { name: 'Section tree' })).toBeInTheDocument()
    })

    it('hides the section tree and shows only the full-width content list below 768px', async () => {
      mockViewport(false)
      mockExplorerAPI()
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('navigation', { name: 'Section tree' })).not.toBeInTheDocument()
    })

    it('still navigates up via a breadcrumb segment below 768px', async () => {
      mockViewport(false)
      mockExplorerAPI()
      renderExplorer()
      await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
      await userEvent.click(within(nav).getByText('Library'))
      await waitFor(() => {
        expect(within(screen.getByRole('list', { name: 'Section contents' })).getByText('Transferencias')).toBeInTheDocument()
      })
    })

    it('shows a "Browse sections" action below 768px that navigates to a non-ancestor section via the picker', async () => {
      mockViewport(false)
      mockExplorerAPI()
      renderExplorer()
      await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')
      await userEvent.click(screen.getByRole('button', { name: /browse sections/i }))

      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByText('Nacionales'))

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
        expect(within(nav).getByText('Nacionales')).toBeInTheDocument()
      })
    })

    it('does not show "Browse sections" at ≥768px', async () => {
      mockViewport(true)
      mockExplorerAPI()
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('button', { name: /browse sections/i })).not.toBeInTheDocument()
    })
  })

  describe('resizable section tree (add-resizable-library-tree)', () => {
    it('renders a resize handle only at ≥768px', async () => {
      mockViewport(true)
      mockExplorerAPI()
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.getByRole('separator', { name: /resize section tree/i })).toBeInTheDocument()
    })

    it('does not render a resize handle below 768px', async () => {
      mockViewport(false)
      mockExplorerAPI()
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('separator', { name: /resize section tree/i })).not.toBeInTheDocument()
    })

    it('widens the tree panel when the resize handle is dragged', async () => {
      mockViewport(true)
      mockExplorerAPI()
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      const handle = screen.getByRole('separator', { name: /resize section tree/i })
      const tree = screen.getByRole('navigation', { name: 'Section tree' })
      expect(tree).toHaveStyle({ width: '256px' })

      fireEvent.pointerDown(handle, { clientX: 100 })
      fireEvent.pointerMove(window, { clientX: 150 })
      fireEvent.pointerUp(window, { clientX: 150 })

      expect(tree).toHaveStyle({ width: '306px' })
    })

    it('resizes the tree panel via the keyboard when the handle has focus', async () => {
      mockViewport(true)
      mockExplorerAPI()
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      const handle = screen.getByRole('separator', { name: /resize section tree/i })
      const tree = screen.getByRole('navigation', { name: 'Section tree' })

      fireEvent.keyDown(handle, { key: 'ArrowRight' })
      expect(tree).toHaveStyle({ width: '272px' })
    })
  })

  describe('row action menu (redesign-delete-mode-menu)', () => {
    it('shows no destructive-tinted "Delete mode" toggle in the toolbar at all', async () => {
      mockExplorerAPI()
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('button', { name: /delete mode/i })).not.toBeInTheDocument()
    })

    // The trigger is additive (design.md D7): sectionDelete alone no longer
    // hides the menu once sectionEdit's "Move to…" is also gated on it —
    // only the absence of both permissions hides the trigger entirely.
    it("still shows a folder row's action menu without sectionDelete, but without a Delete item", async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, sectionDelete: false } })
      renderExplorer()
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')).closest('li') as HTMLElement
      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for nacionales/i }))
      expect(screen.getByRole('menuitem', { name: /move to/i })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it("hides a folder row's action menu entirely without sectionEdit or sectionDelete permission", async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, sectionEdit: false, sectionDelete: false } })
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('button', { name: /actions for nacionales/i })).not.toBeInTheDocument()
    })

    it('omits "Move to…" from a folder row\'s menu without sectionEdit', async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, sectionEdit: false } })
      renderExplorer()
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')).closest('li') as HTMLElement
      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for nacionales/i }))
      expect(screen.queryByRole('menuitem', { name: /move to/i })).not.toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument()
    })

    it("still shows a case row's action menu without caseDelete permission, but without a Delete item", async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, caseDelete: false } })
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      expect(screen.getByRole('menuitem', { name: /move to/i })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it("a folder row's menu is closed by default and lists Delete once opened, with permission", async () => {
      mockExplorerAPI()
      renderExplorer()
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')).closest('li') as HTMLElement
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()

      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for nacionales/i }))
      expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument()
    })

    // Permission-gating retrofit (backlog #110, unify-authenticated-and-public-views
    // tasks.md 2.9) — corrects an earlier false assumption that this page
    // needed no retrofit: only Delete was actually gated.
    it('hides "+ New section" without sectionCreate', async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, sectionCreate: false } })
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('button', { name: /\+ new section/i })).not.toBeInTheDocument()
    })

    it('hides "+ New test case" without caseCreate', async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, caseCreate: false } })
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('link', { name: /\+ new test case/i })).not.toBeInTheDocument()
    })

    it('omits "Move to…" from a case row\'s menu without caseEdit', async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, caseEdit: false } })
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      expect(screen.queryByRole('menuitem', { name: /move to/i })).not.toBeInTheDocument()
    })

    it('hides the tree row\'s "New section in…" trigger without sectionCreate', async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, sectionCreate: false } })
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('button', { name: /new section in nacionales/i })).not.toBeInTheDocument()
    })

    it('deleting a case shows a confirmation naming it; canceling makes no request', async () => {
      mockExplorerAPI()
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/daily transfer limit/i)).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }))

      expect(mockDELETE).not.toHaveBeenCalled()
      expect(screen.getByText('Daily transfer limit')).toBeInTheDocument()
    })

    it('confirming a case delete calls the delete endpoint and removes the row from view', async () => {
      mockExplorerAPI()
      mockDELETE.mockResolvedValue({ response: { ok: true } })
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: /^delete case$/i }))

      await waitFor(() => {
        expect(mockDELETE).toHaveBeenCalledWith(
          '/api/v1/cases/{caseKey}',
          expect.objectContaining({ params: { path: { caseKey: 'c1' } } }),
        )
      })
    })

    it('deleting a folder previews its subtree size in the confirmation before removing it', async () => {
      mockExplorerAPI({ deletePreview: { caseCount: 3, folderCount: 2 } })
      mockDELETE.mockResolvedValue({ response: { ok: true } })
      renderExplorer()
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')).closest('li') as HTMLElement
      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for nacionales/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/nacionales/i)).toBeInTheDocument()
      expect(within(dialog).getByText(/3 case/i)).toBeInTheDocument()
      expect(within(dialog).getByText(/2 subsection/i)).toBeInTheDocument()

      await userEvent.click(within(dialog).getByRole('button', { name: /^delete section$/i }))
      await waitFor(() => {
        expect(mockDELETE).toHaveBeenCalledWith(
          '/api/v1/folders/{folderId}',
          expect.objectContaining({ params: { path: { folderId: 'nacionales' } } }),
        )
      })
    })

    // add-library-folder-selection task 3.3: single-folder "Move to…", the
    // same FolderPicker the case-move dialog already uses.
    it('moving a folder calls the move endpoint with the chosen parent and refreshes', async () => {
      mockExplorerAPI()
      mockPUT.mockResolvedValue({ data: { ...nacionales, parentFolderId: 'root' }, response: { ok: true } })
      renderExplorer()
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')).closest('li') as HTMLElement
      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for nacionales/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /move to/i }))

      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByText('Library'))

      await waitFor(() => {
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/folders/{folderId}',
          expect.objectContaining({
            params: { path: { folderId: 'nacionales' } },
            body: { parentFolderId: 'root' },
          }),
        )
      })
    })

    // task 3.1: the picker must exclude the folder's own subtree — moving a
    // folder into one of its own descendants is nonsensical and the backend
    // rejects it anyway (ErrFolderCycle), so it shouldn't even be offered.
    it("the move-folder picker excludes the folder's own subtree", async () => {
      mockExplorerAPI()
      renderExplorer('/projects/p1/library/root')
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Transferencias')).closest('li') as HTMLElement
      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for transferencias/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /move to/i }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByText('Transferencias')).not.toBeInTheDocument()
      expect(within(dialog).queryByText('Nacionales')).not.toBeInTheDocument()
      expect(within(dialog).getByText('Library')).toBeInTheDocument()
    })

    it('canceling a folder delete confirmation makes no request and leaves the folder in place', async () => {
      mockExplorerAPI({ deletePreview: { caseCount: 0, folderCount: 0 } })
      renderExplorer()
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')).closest('li') as HTMLElement
      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for nacionales/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }))

      expect(mockDELETE).not.toHaveBeenCalled()
      const list = screen.getByRole('list', { name: 'Section contents' })
      expect(within(list).getByText('Nacionales')).toBeInTheDocument()
    })

    it('uses singular wording for a subtree of exactly one case and one subsection', async () => {
      mockExplorerAPI({ deletePreview: { caseCount: 1, folderCount: 1 } })
      renderExplorer()
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')).closest('li') as HTMLElement
      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for nacionales/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/1 case and 1 subsection\./i)).toBeInTheDocument()
    })

    it('closing the delete confirmation via Escape makes no request', async () => {
      mockExplorerAPI()
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))
      await screen.findByRole('dialog')

      await userEvent.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(mockDELETE).not.toHaveBeenCalled()
    })
  })

  describe('creating a section (inline input)', () => {
    // The page also listens for keydown on `window` for J/K/Space/Enter
    // shortcuts. Enter both creates the section (the input's own onKeyDown)
    // and, if the same event reaches that global listener too, immediately
    // navigates/opens whatever row happens to be focused — a real bug found
    // by manual testing (add-library-folder-selection): the input's handler
    // must stop the event from propagating there at all, not rely on
    // `document.activeElement` timing once the input starts unmounting.
    it('creating a section via the content-pane input does not leak Enter to global shortcuts', async () => {
      mockExplorerAPI()
      const globalKeydown = vi.fn()
      window.addEventListener('keydown', globalKeydown)
      mockPOST.mockResolvedValue({
        data: { id: 'new-1', projectId: 'p1', parentFolderId: 'transferencias', name: 'jk test', createdAt: '' },
        response: { ok: true },
      })
      renderExplorer()
      await screen.findByText('Daily transfer limit')

      await userEvent.click(screen.getByRole('button', { name: /\+ new section/i }))
      const input = screen.getByLabelText('New section name')
      await userEvent.type(input, 'jk test')
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(mockPOST).toHaveBeenCalledWith(
          '/api/v1/projects/{projectKey}/folders',
          expect.objectContaining({ body: { name: 'jk test', parentFolderId: 'transferencias' } }),
        )
      })
      expect(globalKeydown).not.toHaveBeenCalled()
      window.removeEventListener('keydown', globalKeydown)
    })

    it('creating a section via the sidebar tree input does not leak Enter to global shortcuts', async () => {
      mockExplorerAPI()
      const globalKeydown = vi.fn()
      window.addEventListener('keydown', globalKeydown)
      mockPOST.mockResolvedValue({
        data: { id: 'new-1', projectId: 'p1', parentFolderId: 'nacionales', name: 'tree section', createdAt: '' },
        response: { ok: true },
      })
      renderExplorer()
      await screen.findByText('Daily transfer limit')

      await userEvent.click(screen.getByRole('button', { name: /new section in nacionales/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /^new section$/i }))
      const input = screen.getByLabelText('New section name')
      await userEvent.type(input, 'tree section')
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(mockPOST).toHaveBeenCalledWith(
          '/api/v1/projects/{projectKey}/folders',
          expect.objectContaining({ body: { name: 'tree section', parentFolderId: 'nacionales' } }),
        )
      })
      expect(globalKeydown).not.toHaveBeenCalled()
      window.removeEventListener('keydown', globalKeydown)
    })
  })

  describe('folder row richness (rework-library-ux)', () => {
    async function contentFolderRow(name: string) {
      const content = await screen.findByRole('list', { name: 'Section contents' })
      return (await within(content).findByText(name)).closest('li') as HTMLElement
    }

    it('shows the direct case count on a subfolder row', async () => {
      mockExplorerAPI()
      renderExplorer()
      const row = await contentFolderRow('Nacionales')
      expect(within(row).getByText('0 cases')).toBeInTheDocument()
    })

    it('shows a critical badge when the subfolder has at least one critical case', async () => {
      const critical = { ...limitCase, id: 'c2', key: 'c2', folderId: 'nacionales', content: { ...limitCase.content, priority: 'critical' } }
      mockExplorerAPI({ cases: [limitCase, critical] })
      renderExplorer()
      const row = await contentFolderRow('Nacionales')
      expect(within(row).getByText(/1 critical/i)).toBeInTheDocument()
    })

    it('shows an automation-coverage meter with the automated/total count', async () => {
      const auto = { ...limitCase, id: 'c2', key: 'c2', folderId: 'nacionales', content: { ...limitCase.content, automated: true } }
      const manual = { ...limitCase, id: 'c3', key: 'c3', folderId: 'nacionales', content: { ...limitCase.content, automated: false } }
      mockExplorerAPI({ cases: [limitCase, auto, manual] })
      renderExplorer()
      const row = await contentFolderRow('Nacionales')
      expect(within(row).getByText(/1\/2 automated/i)).toBeInTheDocument()
    })

    it('shows "empty" instead of a coverage meter for a folder with no direct cases', async () => {
      mockExplorerAPI()
      renderExplorer()
      const row = await contentFolderRow('Nacionales')
      expect(within(row).getByText(/^empty$/i)).toBeInTheDocument()
    })
  })

  describe('case row richness (rework-library-ux)', () => {
    it('shows a priority pill, and platform/test type as plain text (polish-library-and-suites-pages)', async () => {
      mockExplorerAPI()
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).getByText('high')).toBeInTheDocument()
      expect(within(row).getByText('web · e2e')).toBeInTheDocument()
    })

    it('shows no version chip (polish-library-and-suites-pages)', async () => {
      mockExplorerAPI()
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).queryByText(`v${limitCase.currentVersion}`)).not.toBeInTheDocument()
    })

    it('caps suite-name tags at 2 with a "+N" overflow indicator (polish-library-and-suites-pages)', async () => {
      const suites = [
        { id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' },
        { id: 's2', projectId: 'p1', name: 'Regression', caseIds: ['c1'], createdAt: '' },
        { id: 's3', projectId: 'p1', name: 'Nightly', caseIds: ['c1'], createdAt: '' },
      ]
      mockExplorerAPI({ suites })
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).getByText('Smoke')).toBeInTheDocument()
      expect(within(row).getByText('Regression')).toBeInTheDocument()
      expect(within(row).queryByText('Nightly')).not.toBeInTheDocument()
      expect(within(row).getByText('+1')).toBeInTheDocument()
    })

    it('truncates a long case title instead of wrapping the row (polish-library-and-suites-pages)', async () => {
      const longTitleCase = {
        ...limitCase,
        content: {
          ...limitCase.content,
          title: 'A daily transfer limit case with a title so long it would otherwise wrap the row',
        },
      }
      mockExplorerAPI({ cases: [longTitleCase] })
      renderExplorer()
      const title = await screen.findByText(longTitleCase.content.title)
      expect(title).toHaveClass('truncate')
    })

    it('shows an Auto pill for an automated case', async () => {
      mockExplorerAPI()
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).getByText('Auto')).toBeInTheDocument()
    })

    it('shows a Manual pill for a non-automated case', async () => {
      const manual = { ...limitCase, content: { ...limitCase.content, automated: false } }
      mockExplorerAPI({ cases: [manual] })
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).getByText('Manual')).toBeInTheDocument()
    })

    it('shows a Flaky pill for a case the server reports as currently flaky', async () => {
      mockExplorerAPI({ flakyCases: [{ caseKey: 'c1', caseTitle: 'Daily transfer limit', currentVersion: 2, rate: 50 }] })
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).getByText('Flaky')).toBeInTheDocument()
    })

    it('does not show a Flaky pill for a case the server does not report as flaky', async () => {
      mockExplorerAPI({ flakyCases: [] })
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).queryByText('Flaky')).not.toBeInTheDocument()
    })

    it('shows a Stale pill for a case untouched 90+ days', async () => {
      const stale = { ...limitCase, updatedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString() }
      mockExplorerAPI({ cases: [stale] })
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).getByText('Stale')).toBeInTheDocument()
    })

    it('shows a relative-time readout, not Stale, for a recently touched case', async () => {
      const fresh = { ...limitCase, updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }
      mockExplorerAPI({ cases: [fresh] })
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).queryByText('Stale')).not.toBeInTheDocument()
      expect(within(row).getByText(/2 days ago/i)).toBeInTheDocument()
    })
  })

  describe('search and filtering (rework-library-ux)', () => {
    const otherCase = {
      ...limitCase,
      id: 'c2',
      key: 'c2',
      folderId: 'nacionales',
      content: {
        ...limitCase.content,
        title: 'National transfer succeeds',
        priority: 'low',
        platform: 'ios',
        testType: 'unit',
        automated: false,
        tags: [],
      },
    }

    it('search narrows the current folder’s cases by title substring', async () => {
      mockExplorerAPI()
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      await userEvent.type(screen.getByLabelText(/search test cases/i), 'nonexistent')
      expect(screen.queryByText('Daily transfer limit')).not.toBeInTheDocument()
    })

    it('filtering by priority narrows to matching cases only', async () => {
      mockExplorerAPI({ cases: [limitCase, { ...limitCase, id: 'c2', key: 'c2', content: { ...limitCase.content, title: 'Low prio case', priority: 'low' } }] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      await userEvent.selectOptions(screen.getByLabelText(/^priority$/i), 'low')
      expect(screen.queryByText('Daily transfer limit')).not.toBeInTheDocument()
      expect(screen.getByText('Low prio case')).toBeInTheDocument()
    })

    it('filtering by Flaky narrows to cases the server reports as currently flaky', async () => {
      const other = { ...limitCase, id: 'c2', key: 'c2', content: { ...limitCase.content, title: 'National transfer succeeds' } }
      mockExplorerAPI({
        cases: [limitCase, other],
        flakyCases: [{ caseKey: 'c1', caseTitle: 'Daily transfer limit', currentVersion: 2, rate: 50 }],
      })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      await userEvent.selectOptions(screen.getByLabelText(/^flaky$/i), 'yes')
      expect(screen.getByText('Daily transfer limit')).toBeInTheDocument()
      expect(screen.queryByText('National transfer succeeds')).not.toBeInTheDocument()
    })

    it('the Flaky filter composes with other active filters', async () => {
      const otherFlaky = {
        ...limitCase,
        id: 'c2',
        key: 'c2',
        content: { ...limitCase.content, title: 'Low prio flaky case', priority: 'low' },
      }
      mockExplorerAPI({
        cases: [limitCase, otherFlaky],
        flakyCases: [
          { caseKey: 'c1', caseTitle: 'Daily transfer limit', currentVersion: 2, rate: 50 },
          { caseKey: 'c2', caseTitle: 'Low prio flaky case', currentVersion: 2, rate: 50 },
        ],
      })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      await userEvent.selectOptions(screen.getByLabelText(/^flaky$/i), 'yes')
      await userEvent.selectOptions(screen.getByLabelText(/^priority$/i), 'low')
      expect(screen.queryByText('Daily transfer limit')).not.toBeInTheDocument()
      expect(screen.getByText('Low prio flaky case')).toBeInTheDocument()
    })

    it('hides "Clear filters" until a filter is active (polish-library-and-suites-pages)', async () => {
      mockExplorerAPI()
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()
      await userEvent.selectOptions(screen.getByLabelText(/^priority$/i), 'low')
      expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    })

    it('"Clear filters" resets search and every filter dropdown', async () => {
      mockExplorerAPI()
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      await userEvent.selectOptions(screen.getByLabelText(/^priority$/i), 'low')
      expect(screen.queryByText('Daily transfer limit')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /clear filters/i }))
      expect(screen.getByText('Daily transfer limit')).toBeInTheDocument()
    })

    it('shows a filtered-to-zero state distinct from a genuinely empty folder, offering to clear filters', async () => {
      // A folder with no subfolders, so the filtered-to-zero branch (rather
      // than "subfolders render regardless of the filter") actually applies.
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      await userEvent.selectOptions(screen.getByLabelText(/^priority$/i), 'low')
      expect(screen.getByText(/no cases match your filters/i)).toBeInTheDocument()
      expect(screen.queryByText(/nothing here yet/i)).not.toBeInTheDocument()
    })

    it('"Search entire Library" flattens matches across every folder, each labeled with its folder path', async () => {
      mockExplorerAPI({ cases: [limitCase, otherCase] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      expect(screen.queryByText('National transfer succeeds')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('checkbox', { name: /search entire library/i }))
      expect(screen.getByText('Daily transfer limit')).toBeInTheDocument()
      expect(screen.getByText('National transfer succeeds')).toBeInTheDocument()
      expect(screen.getByText('Transferencias / Nacionales')).toBeInTheDocument()
    })

    it('"Search entire Library" composes with the active filters', async () => {
      mockExplorerAPI({ cases: [limitCase, otherCase] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      await userEvent.click(screen.getByRole('checkbox', { name: /search entire library/i }))
      await userEvent.selectOptions(screen.getByLabelText(/^priority$/i), 'low')

      expect(screen.queryByText('Daily transfer limit')).not.toBeInTheDocument()
      expect(screen.getByText('National transfer succeeds')).toBeInTheDocument()
    })
  })

  describe('right-click opens the row menu (unify-library-row-menus)', () => {
    it('right-clicking a case row opens its menu, listing the same items as the visible trigger', async () => {
      mockExplorerAPI()
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.pointer({ keys: '[MouseRight]', target: caseRow })
      // The right-click-opened menu is portaled to <body>, so it's no
      // longer a DOM descendant of caseRow — query at document scope.
      expect(screen.getByRole('menuitem', { name: /move to/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument()
    })

    it('right-clicking a folder row opens its menu, listing Delete', async () => {
      mockExplorerAPI()
      renderExplorer()
      const folderRow = (
        await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')
      ).closest('li') as HTMLElement
      await userEvent.pointer({ keys: '[MouseRight]', target: folderRow })
      expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument()
    })

    it('right-clicking a folder row without sectionEdit or sectionDelete permission does nothing', async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, sectionEdit: false, sectionDelete: false } })
      renderExplorer()
      const folderRow = (
        await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')
      ).closest('li') as HTMLElement
      await userEvent.pointer({ keys: '[MouseRight]', target: folderRow })
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  // Dual-mode migration (unify-authenticated-and-public-views tasks.md
  // group 9).
  describe('anonymous / dual-mode', () => {
    it('fetches from the public API when there is no session', async () => {
      mockExplorerAPI({ anonymous: true })
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}', expect.anything())
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/folders', expect.anything())
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/cases', expect.anything())
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/suites', expect.anything())
      expect(mockGET).toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}/flaky-cases', expect.anything())
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
    })

    it('renders the identical Library a member sees, with zero create/move/delete controls', async () => {
      mockExplorerAPI({ anonymous: true })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      expect(screen.getByText('high')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /\+ new section/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /\+ new test case/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /new section in/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /actions for daily transfer limit/i })).not.toBeInTheDocument()
    })

    it('fires no request while the session check is still in flight', async () => {
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') return new Promise(() => {}) // never resolves
        return Promise.resolve({ data: undefined, response: { ok: true } })
      })
      renderExplorer()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/public/projects/{projectKey}', expect.anything())
    })

    it('shows a "Log in" link alongside "Go to Projects" when a project is not found anonymously', async () => {
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') return Promise.resolve({ data: undefined, response: { ok: false } })
        if (path === '/api/v1/public/projects/{projectKey}')
          return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
        return Promise.resolve({ data: undefined, response: { ok: true } })
      })
      renderExplorer()
      expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument()
    })
  })

  // design.md D11: a signed-in user with no membership on a public
  // project gets 403 from every authenticated route (including
  // /permissions, which useProjectReadAccess itself checks) — the page
  // must fall back to the public branch instead of showing "not found",
  // exactly like an anonymous visitor would see.
  describe('signed-in non-member (design.md D11)', () => {
    it('falls back to the public API and renders the Library instead of "not found"', async () => {
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
        if (path === '/api/v1/projects/{projectKey}/permissions')
          return Promise.resolve({ data: undefined, response: { ok: false } })
        if (path === '/api/v1/public/projects/{projectKey}')
          return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
        if (path === '/api/v1/public/projects/{projectKey}/folders')
          return Promise.resolve({ data: { items: [root, transferencias, nacionales], nextCursor: null }, response: { ok: true } })
        if (path === '/api/v1/public/projects/{projectKey}/cases')
          return Promise.resolve({ data: { items: [limitCase], nextCursor: null }, response: { ok: true } })
        if (path === '/api/v1/public/projects/{projectKey}/suites')
          return Promise.resolve({ data: { items: [], nextCursor: null }, response: { ok: true } })
        if (path === '/api/v1/public/projects/{projectKey}/flaky-cases') return Promise.resolve({ data: [], response: { ok: true } })
        return Promise.resolve({ data: undefined, response: { ok: false } })
      })
      renderExplorer()
      expect(await screen.findByText('Daily transfer limit')).toBeInTheDocument()
      expect(screen.queryByText(/project not found/i)).not.toBeInTheDocument()
      expect(mockGET).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}', expect.anything())
    })
  })

  describe('bulk selection (add-library-bulk-select)', () => {
    const caseTwo = { ...limitCase, id: 'c2', key: 'c2', content: { ...limitCase.content, title: 'Case Two' } }
    const caseThree = { ...limitCase, id: 'c3', key: 'c3', content: { ...limitCase.content, title: 'Case Three' } }

    // user-event's click() takes no modifier options in this version —
    // fireEvent sets the native event's shiftKey directly instead.
    function shiftClick(el: HTMLElement) {
      fireEvent.click(el, { shiftKey: true })
    }

    it('selects a case row on Shift+Click without navigating', async () => {
      mockExplorerAPI()
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      const row = title.closest('li') as HTMLElement
      await shiftClick(title)
      expect(row).toHaveClass('bg-primary/10')
      expect(screen.queryByTestId('case-detail-probe')).not.toBeInTheDocument()
    })

    it('a plain click still opens the case and selects nothing', async () => {
      mockExplorerAPI()
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      const row = title.closest('li') as HTMLElement
      await userEvent.click(title)
      expect(await screen.findByTestId('case-detail-probe')).toBeInTheDocument()
      expect(row).not.toHaveClass('bg-primary/10')
    })

    it('extends a range on a second Shift+Click', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo, caseThree] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      await shiftClick(screen.getByText('Daily transfer limit'))
      await shiftClick(screen.getByText('Case Three'))

      for (const title of ['Daily transfer limit', 'Case Two', 'Case Three']) {
        expect(screen.getByText(title).closest('li')).toHaveClass('bg-primary/10')
      }
    })

    // A Shift+Click that toggles selection must not also trigger the
    // browser's own native text-selection gesture — Shift+Click is the
    // browser's standard "extend text selection to here" shortcut too, and
    // by the time a `click` handler's preventDefault() runs, the browser has
    // already finalized a native selection from mousedown/mouseup. The fix
    // has to preventDefault on mousedown itself, before the browser acts.
    it("a Shift+Click on a case row doesn't trigger native text selection", async () => {
      mockExplorerAPI()
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      const event = fireEvent.mouseDown(title, { shiftKey: true })
      expect(event).toBe(false) // fireEvent returns false when preventDefault() was called
    })

    it("a Shift+Click on a folder row doesn't trigger native text selection", async () => {
      mockExplorerAPI()
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      const folderTitle = within(list).getByText('Nacionales')
      const event = fireEvent.mouseDown(folderTitle, { shiftKey: true })
      expect(event).toBe(false)
    })

    // add-library-folder-selection supersedes the old "folders are exempt
    // from Shift+Click" behavior: a folder row now selects like any other
    // row, and a range can span both kinds (library-bulk-select spec.md).
    it('shift-clicking a folder row selects it instead of navigating', async () => {
      mockExplorerAPI()
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      const folderRow = within(list).getByText('Nacionales').closest('li') as HTMLElement
      shiftClick(within(list).getByText('Nacionales'))

      expect(folderRow).toHaveClass('bg-primary/10')
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
      expect(within(nav).queryByText('Nacionales')).not.toBeInTheDocument()
    })

    it('a plain click on a folder row still navigates into it and selects nothing', async () => {
      mockExplorerAPI()
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      const folderRow = within(list).getByText('Nacionales').closest('li') as HTMLElement
      await userEvent.click(within(list).getByText('Nacionales'))

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
        expect(within(nav).getByText('Nacionales')).toBeInTheDocument()
      })
      expect(folderRow).not.toHaveClass('bg-primary/10')
    })

    it('a range can span a folder row and a case row together', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      await within(list).findByText('Daily transfer limit')
      shiftClick(within(list).getByText('Nacionales'))
      shiftClick(within(list).getByText('Case Two'))

      for (const title of ['Nacionales', 'Daily transfer limit', 'Case Two']) {
        expect(within(list).getByText(title).closest('li')).toHaveClass('bg-primary/10')
      }
    })
  })

  describe('keyboard navigation and selection (add-library-bulk-select)', () => {
    const caseTwo = { ...limitCase, id: 'c2', key: 'c2', content: { ...limitCase.content, title: 'Case Two', priority: 'medium' } }
    const caseThree = { ...limitCase, id: 'c3', key: 'c3', content: { ...limitCase.content, title: 'Case Three', priority: 'low' } }

    it('arrow keys move focus through case rows, scrolling the focused row into view', async () => {
      const user = userEvent.setup()
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase, caseTwo, caseThree] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')

      await user.keyboard('{ArrowDown}')

      const focused = document.querySelector('[data-focused="true"]')
      expect(focused).not.toBeNull()
      expect(within(focused as HTMLElement).getByText('Case Two')).toBeInTheDocument()
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('j/k move focus the same as arrow keys', async () => {
      const user = userEvent.setup()
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase, caseTwo, caseThree] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')

      await user.keyboard('jj')
      await user.keyboard('k')

      const focused = document.querySelector('[data-focused="true"]')
      expect(within(focused as HTMLElement).getByText('Case Two')).toBeInTheDocument()
    })

    it('Space toggles the focused row', async () => {
      const user = userEvent.setup()
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase, caseTwo] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')

      await user.keyboard('j')
      await user.keyboard(' ')

      expect(screen.getByText('Case Two').closest('li')).toHaveClass('bg-primary/10')
      expect(screen.getByText('Daily transfer limit').closest('li')).not.toHaveClass('bg-primary/10')
    })

    it('Shift+Space extends the range from the anchor to the focused row', async () => {
      const user = userEvent.setup()
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase, caseTwo, caseThree] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')

      await user.keyboard(' ')
      await user.keyboard('jj')
      await user.keyboard('{Shift>} {/Shift}')

      for (const title of ['Daily transfer limit', 'Case Two', 'Case Three']) {
        expect(screen.getByText(title).closest('li')).toHaveClass('bg-primary/10')
      }
    })

    it('Enter opens the focused case', async () => {
      const user = userEvent.setup()
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase, caseTwo] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')

      await user.keyboard('j')
      await user.keyboard('{Enter}')

      expect(await screen.findByTestId('case-detail-probe')).toHaveTextContent('c2')
    })

    // add-library-folder-selection: folder rows join keyboard nav too — a
    // section with subfolders puts them first (render order), and pressing
    // Enter while one is focused navigates into it instead of opening a case.
    it('folder rows come first in keyboard nav order, and Enter navigates into a focused folder', async () => {
      const user = userEvent.setup()
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')

      const focused = document.querySelector('[data-focused="true"]')
      expect(within(focused as HTMLElement).getByText('Nacionales')).toBeInTheDocument()

      await user.keyboard('{Enter}')

      await waitFor(() => {
        const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
        expect(within(nav).getByText('Nacionales')).toBeInTheDocument()
      })
    })

    it('keyboard shortcuts do nothing while an unrelated input has focus', async () => {
      const user = userEvent.setup()
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase, caseTwo] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()

      await user.keyboard('j ')

      expect(screen.queryByTestId('case-detail-probe')).not.toBeInTheDocument()
      expect(screen.getByText('Daily transfer limit').closest('li')).not.toHaveClass('bg-primary/10')
      input.remove()
    })

    it('resets keyboard focus to the first row when the visible case list changes', async () => {
      const user = userEvent.setup()
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase, caseTwo, caseThree] })
      renderExplorer()
      await screen.findByText('Daily transfer limit')
      await user.keyboard('jj')

      await user.selectOptions(screen.getByLabelText(/^priority$/i), 'high')
      await user.keyboard('{Enter}')

      expect(await screen.findByTestId('case-detail-probe')).toHaveTextContent('c1')
    })

    it('shows a persistent shortcuts hint and opens an overlay with ?', async () => {
      const user = userEvent.setup()
      mockExplorerAPI()
      renderExplorer()
      await screen.findByText('Daily transfer limit')

      expect(screen.getByLabelText('Keyboard shortcuts')).toBeInTheDocument()
      expect(screen.getByText('Move focus')).toBeInTheDocument()

      await user.keyboard('?')
      expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument()
    })
  })

  describe('bulk action footer bar (add-library-bulk-select)', () => {
    const caseTwo = { ...limitCase, id: 'c2', key: 'c2', content: { ...limitCase.content, title: 'Case Two' } }
    const caseThree = { ...limitCase, id: 'c3', key: 'c3', content: { ...limitCase.content, title: 'Case Three' } }

    function shiftClick(el: HTMLElement) {
      fireEvent.click(el, { shiftKey: true })
    }

    it('shows the footer bar once a case is selected, with a "Select all" link', async () => {
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase, caseTwo, caseThree] })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)

      expect(screen.getByText('1 selected')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /select all 3/i })).toBeInTheDocument()
    })

    it('"Select all" selects every visible case and then hides itself', async () => {
      mockExplorerAPI({ folders: [root, transferencias], cases: [limitCase, caseTwo, caseThree] })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)

      await userEvent.click(screen.getByRole('button', { name: /select all 3/i }))

      expect(screen.getByText('3 selected')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument()
      for (const t of ['Daily transfer limit', 'Case Two', 'Case Three']) {
        expect(screen.getByText(t).closest('li')).toHaveClass('bg-primary/10')
      }
    })

    // add-library-folder-selection: "Select all" spans both kinds in one
    // combined selection.
    it('"Select all" spans folders and cases together', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      const title = await within(list).findByText('Daily transfer limit')
      shiftClick(title)

      expect(screen.getByRole('button', { name: /select all 3/i })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /select all 3/i }))

      expect(screen.getByText('3 selected')).toBeInTheDocument()
      for (const t of ['Nacionales', 'Daily transfer limit', 'Case Two']) {
        expect(within(list).getByText(t).closest('li')).toHaveClass('bg-primary/10')
      }
    })

    it('"Clear" empties the selection and hides the footer bar', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)
      await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

      expect(screen.queryByText(/^\d+ selected$/)).not.toBeInTheDocument()
      expect(screen.getByText('Daily transfer limit').closest('li')).not.toHaveClass('bg-primary/10')
    })

    it('bulk "Move to…" moves every selected case to the chosen folder', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      mockPUT.mockResolvedValue({ response: { ok: true } })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)
      shiftClick(screen.getByText('Case Two'))

      await userEvent.click(screen.getByRole('button', { name: /^move to…$/i }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByText('Nacionales'))

      await waitFor(() => {
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/cases/{caseKey}/folder',
          expect.objectContaining({ params: { path: { caseKey: 'c1' } }, body: { folderId: 'nacionales' } }),
        )
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/cases/{caseKey}/folder',
          expect.objectContaining({ params: { path: { caseKey: 'c2' } }, body: { folderId: 'nacionales' } }),
        )
      })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText(/^\d+ selected$/)).not.toBeInTheDocument()
    })

    // add-library-folder-selection: a mixed folder+case selection splits by
    // kind internally — cases go through the case-move endpoint, the
    // selected folder through the folder-move endpoint, against one target.
    it('bulk "Move to…" moves both a selected folder and selected cases to the chosen target', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      mockPUT.mockResolvedValue({ response: { ok: true } })
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      await within(list).findByText('Daily transfer limit')
      shiftClick(within(list).getByText('Nacionales'))
      shiftClick(within(list).getByText('Case Two'))

      await userEvent.click(screen.getByRole('button', { name: /^move to…$/i }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByText('Library'))

      await waitFor(() => {
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/cases/{caseKey}/folder',
          expect.objectContaining({ params: { path: { caseKey: 'c1' } }, body: { folderId: 'root' } }),
        )
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/cases/{caseKey}/folder',
          expect.objectContaining({ params: { path: { caseKey: 'c2' } }, body: { folderId: 'root' } }),
        )
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/folders/{folderId}',
          expect.objectContaining({ params: { path: { folderId: 'nacionales' } }, body: { parentFolderId: 'root' } }),
        )
      })
      expect(screen.queryByText(/^\d+ selected$/)).not.toBeInTheDocument()
    })

    it('bulk "Delete" sums the selected folder\'s own preview into the confirmation total', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo], deletePreview: { caseCount: 5, folderCount: 2 } })
      mockDELETE.mockResolvedValue({ response: { ok: true } })
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      await within(list).findByText('Daily transfer limit')
      shiftClick(within(list).getByText('Nacionales'))
      shiftClick(within(list).getByText('Case Two'))

      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      expect(await screen.findByRole('heading', { name: /delete 7 cases and 2 subsections/i })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

      await waitFor(() => {
        for (const key of ['c1', 'c2']) {
          expect(mockDELETE).toHaveBeenCalledWith(
            '/api/v1/cases/{caseKey}',
            expect.objectContaining({ params: { path: { caseKey: key } } }),
          )
        }
        expect(mockDELETE).toHaveBeenCalledWith(
          '/api/v1/folders/{folderId}',
          expect.objectContaining({ params: { path: { folderId: 'nacionales' } } }),
        )
      })
      expect(screen.queryByText(/^\d+ selected$/)).not.toBeInTheDocument()
    })

    it('bulk "Delete" names the count and deletes every selected case on confirm', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo, caseThree] })
      mockDELETE.mockResolvedValue({ response: { ok: true } })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)
      shiftClick(screen.getByText('Case Three'))

      await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
      expect(await screen.findByRole('heading', { name: /delete 3 cases/i })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

      await waitFor(() => {
        for (const key of ['c1', 'c2', 'c3']) {
          expect(mockDELETE).toHaveBeenCalledWith(
            '/api/v1/cases/{caseKey}',
            expect.objectContaining({ params: { path: { caseKey: key } } }),
          )
        }
      })
      expect(screen.queryByText(/^\d+ selected$/)).not.toBeInTheDocument()
    })
  })

  describe('bulk "Create suite from N cases…" (add-suite-from-library-selection)', () => {
    const caseTwo = { ...limitCase, id: 'c2', key: 'c2', content: { ...limitCase.content, title: 'Case Two' } }
    // A folder nested two levels deep under "Nacionales" (itself a subfolder
    // of "Transferencias", the folder rendered by default) — used to prove
    // the resolved count really recurses, not just reads a direct-children
    // count (design.md D7).
    const nacionalesSub = { id: 'nacionalesSub', projectId: 'p1', parentFolderId: 'nacionales', name: 'Internal Transfers', createdAt: '' }
    const caseInNacionales = { ...limitCase, id: 'c3', key: 'c3', folderId: 'nacionales', content: { ...limitCase.content, title: 'Case In Nacionales' } }
    const caseInNacionalesSub = {
      ...limitCase,
      id: 'c4',
      key: 'c4',
      folderId: 'nacionalesSub',
      content: { ...limitCase.content, title: 'Case In Nacionales Sub' },
    }

    function shiftClick(el: HTMLElement) {
      fireEvent.click(el, { shiftKey: true })
    }

    it('counts only the directly-selected cases when no folder is selected', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      shiftClick(await screen.findByText('Daily transfer limit'))
      shiftClick(screen.getByText('Case Two'))

      expect(await screen.findByRole('button', { name: /create suite from 2 cases…/i })).toBeInTheDocument()
    })

    it('recursively counts every case inside a selected folder, at any depth', async () => {
      mockExplorerAPI({
        folders: [root, transferencias, nacionales, nacionalesSub],
        cases: [limitCase, caseInNacionales, caseInNacionalesSub],
      })
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      shiftClick(within(list).getByText('Nacionales'))

      expect(await screen.findByRole('button', { name: /create suite from 2 cases…/i })).toBeInTheDocument()
    })

    it('sums direct and folder-recursive cases without double-counting overlap', async () => {
      mockExplorerAPI({
        folders: [root, transferencias, nacionales, nacionalesSub],
        cases: [limitCase, caseTwo, caseInNacionales, caseInNacionalesSub],
      })
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      await within(list).findByText('Daily transfer limit')
      shiftClick(within(list).getByText('Nacionales'))
      shiftClick(within(list).getByText('Case Two'))

      // Nacionales' subtree resolves to {c3, c4}; c1/c2 are outside it, so
      // the total is 4 with no duplicates possible.
      expect(await screen.findByRole('button', { name: /create suite from 4 cases…/i })).toBeInTheDocument()
    })

    it('is absent when the selection resolves to zero cases', async () => {
      mockExplorerAPI({ folders: [root, transferencias, nacionales], cases: [] })
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      shiftClick(within(list).getByText('Nacionales'))

      expect(screen.getByText('1 selected')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /create suite from/i })).not.toBeInTheDocument()
    })

    it('is absent without suiteCreate permission', async () => {
      mockExplorerAPI({ cases: [limitCase], permissions: { ...allPermissions, suiteCreate: false } })
      renderExplorer()
      shiftClick(await screen.findByText('Daily transfer limit'))

      expect(screen.queryByRole('button', { name: /create suite from/i })).not.toBeInTheDocument()
    })

    it('opens a dialog naming the resolved count, disables confirm until a name is entered, and creates the suite on confirm', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      mockPOST.mockImplementation((path: string) => {
        if (path === '/api/v1/projects/{projectKey}/suites')
          return Promise.resolve({ data: { key: 's-new', name: 'Login smoke', caseIds: [], createdAt: '' }, response: { ok: true } })
        return Promise.resolve({ data: undefined, response: { ok: true } })
      })
      mockPUT.mockResolvedValue({ response: { ok: true } })
      renderExplorer()
      shiftClick(await screen.findByText('Daily transfer limit'))
      shiftClick(screen.getByText('Case Two'))

      await userEvent.click(screen.getByRole('button', { name: /create suite from 2 cases…/i }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/new suite from selection/i)).toBeInTheDocument()
      expect(within(dialog).getByText(/2 cases from your selection will become this suite's members/i)).toBeInTheDocument()
      const confirmButton = within(dialog).getByRole('button', { name: /^create suite$/i })
      expect(confirmButton).toBeDisabled()

      await userEvent.type(within(dialog).getByLabelText(/suite name/i), 'Login smoke')
      expect(confirmButton).not.toBeDisabled()
      await userEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockPOST).toHaveBeenCalledWith(
          '/api/v1/projects/{projectKey}/suites',
          expect.objectContaining({ params: { path: { projectKey: 'p1' } }, body: { name: 'Login smoke' } }),
        )
        for (const caseKey of ['c1', 'c2']) {
          expect(mockPUT).toHaveBeenCalledWith(
            '/api/v1/suites/{suiteKey}/cases/{caseKey}',
            expect.objectContaining({ params: { path: { suiteKey: 's-new', caseKey } } }),
          )
        }
      })
      expect(await screen.findByTestId('suite-detail-probe')).toHaveTextContent('suite detail for s-new')
      expect(screen.queryByText(/^\d+ selected$/)).not.toBeInTheDocument()
    })

    it('adds a selected folder\'s recursively-resolved cases as suite members, not the folder itself', async () => {
      mockExplorerAPI({
        folders: [root, transferencias, nacionales, nacionalesSub],
        cases: [limitCase, caseInNacionales, caseInNacionalesSub],
      })
      mockPOST.mockImplementation((path: string) => {
        if (path === '/api/v1/projects/{projectKey}/suites')
          return Promise.resolve({ data: { key: 's-new', name: 'Nacionales suite', caseIds: [], createdAt: '' }, response: { ok: true } })
        return Promise.resolve({ data: undefined, response: { ok: true } })
      })
      mockPUT.mockResolvedValue({ response: { ok: true } })
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      shiftClick(within(list).getByText('Nacionales'))

      await userEvent.click(screen.getByRole('button', { name: /create suite from 2 cases…/i }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.type(within(dialog).getByLabelText(/suite name/i), 'Nacionales suite')
      await userEvent.click(within(dialog).getByRole('button', { name: /^create suite$/i }))

      await waitFor(() => {
        for (const caseKey of ['c3', 'c4']) {
          expect(mockPUT).toHaveBeenCalledWith(
            '/api/v1/suites/{suiteKey}/cases/{caseKey}',
            expect.objectContaining({ params: { path: { suiteKey: 's-new', caseKey } } }),
          )
        }
      })
      expect(mockPUT).not.toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}/cases/{caseKey}',
        expect.objectContaining({ params: { path: { suiteKey: 's-new', caseKey: 'nacionales' } } }),
      )
    })

    it('cancelling the dialog creates no suite and leaves the selection untouched', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      shiftClick(await screen.findByText('Daily transfer limit'))
      shiftClick(screen.getByText('Case Two'))

      await userEvent.click(screen.getByRole('button', { name: /create suite from 2 cases…/i }))
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(mockPOST).not.toHaveBeenCalledWith('/api/v1/projects/{projectKey}/suites', expect.anything())
      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })
  })

  // Mirrors RunPage's existing isBulkContext pattern (add-run-row-status-actions):
  // right-clicking a row that's part of a real multi-selection (selection
  // size > 1) shows the bulk actions instead of that row's own single-item
  // menu; a lone selected row, or a right-click outside the selection, still
  // gets the ordinary single-item menu. Opening either menu never changes
  // which rows are selected.
  describe('right-click on a multi-selection shows bulk actions', () => {
    const caseTwo = { ...limitCase, id: 'c2', key: 'c2', content: { ...limitCase.content, title: 'Case Two' } }

    function shiftClick(el: HTMLElement) {
      fireEvent.click(el, { shiftKey: true })
    }

    it('shows Move to…/Create suite/Delete when right-clicking a case that is part of a multi-selection', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)
      shiftClick(screen.getByText('Case Two'))

      fireEvent.contextMenu(title)
      const menu = await screen.findByRole('menu')
      expect(within(menu).getByRole('menuitem', { name: /^move to…$/i })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: /create suite from 2 cases…/i })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument()
      // Opening the menu must not itself change the selection.
      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })

    it('shows bulk actions when right-clicking a folder that is part of a multi-selection, resolved recursively', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      const list = await screen.findByRole('list', { name: 'Section contents' })
      const folderTitle = within(list).getByText('Nacionales')
      shiftClick(folderTitle)
      shiftClick(within(list).getByText('Case Two'))

      fireEvent.contextMenu(folderTitle)
      const menu = await screen.findByRole('menu')
      // The Shift+Click range from Nacionales to Case Two also includes
      // "Daily transfer limit" (rendered between them); Nacionales itself
      // has no cases in this fixture, so the resolved total is just the two
      // directly-selected cases.
      expect(within(menu).getByRole('menuitem', { name: /create suite from 2 cases…/i })).toBeInTheDocument()
    })

    it('still shows the ordinary single-item menu for a lone selected row (selection size 1)', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)

      fireEvent.contextMenu(title)
      const menu = await screen.findByRole('menu')
      expect(within(menu).getByRole('menuitem', { name: /^move to…$/i })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument()
      expect(within(menu).queryByRole('menuitem', { name: /create suite/i })).not.toBeInTheDocument()
    })

    it('right-clicking a row outside the active selection shows its own single-item menu, not the bulk one', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)
      shiftClick(screen.getByText('Case Two'))
      // Now deselect down to just "Case Two" being the sole selection by
      // clearing and reselecting only it.
      await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
      shiftClick(screen.getByText('Case Two'))

      fireEvent.contextMenu(title)
      const menu = await screen.findByRole('menu')
      expect(within(menu).queryByRole('menuitem', { name: /create suite/i })).not.toBeInTheDocument()
      // Right-clicking Daily transfer limit (unselected) must not select it.
      expect(title.closest('li')).not.toHaveClass('bg-primary/10')
    })

    it('clicking "Create suite from N cases…" in the bulk right-click menu opens the create-suite dialog', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)
      shiftClick(screen.getByText('Case Two'))

      fireEvent.contextMenu(title)
      const menu = await screen.findByRole('menu')
      await userEvent.click(within(menu).getByRole('menuitem', { name: /create suite from 2 cases…/i }))

      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/new suite from selection/i)).toBeInTheDocument()
    })

    it('clicking "Delete" in the bulk right-click menu opens the same bulk delete confirmation', async () => {
      mockExplorerAPI({ cases: [limitCase, caseTwo] })
      renderExplorer()
      const title = await screen.findByText('Daily transfer limit')
      shiftClick(title)
      shiftClick(screen.getByText('Case Two'))

      fireEvent.contextMenu(title)
      const menu = await screen.findByRole('menu')
      await userEvent.click(within(menu).getByRole('menuitem', { name: /^delete$/i }))

      expect(await screen.findByRole('heading', { name: /delete 2 cases/i })).toBeInTheDocument()
    })
  })
})
