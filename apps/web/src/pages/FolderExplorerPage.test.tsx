import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import FolderExplorerPage from './FolderExplorerPage'
import { api } from '@/lib/api'

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

function mockExplorerAPI(overrides: Partial<Record<string, unknown>> = {}) {
  mockGET.mockImplementation((path: string, options?: { params?: { path?: Record<string, string> } }) => {
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/folders')
      return Promise.resolve({ data: overrides.folders ?? [root, transferencias, nacionales], response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/cases')
      return Promise.resolve({ data: overrides.cases ?? [limitCase], response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/suites')
      return Promise.resolve({
        data: overrides.suites ?? [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: overrides.permissions ?? allPermissions, response: { ok: true } })
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

function renderExplorer(path = '/projects/p1/library/transferencias') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectKey/library" element={<FolderExplorerPage />} />
        <Route path="/projects/:projectKey/library/:folderId" element={<FolderExplorerPage />} />
        <Route path="/projects/:projectKey/cases/:caseKey" element={<CaseDetailProbe />} />
      </Routes>
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
  // useMediaQuery('(min-width: 768px)') defaults to matches:false (the
  // shared jsdom matchMedia stub in src/test/setup.ts), which reads as
  // "mobile" for a min-width query — the opposite of useIsMobile's
  // max-width semantics that default was written for. Tests unrelated to
  // responsive behavior assume desktop, matching this page's pre-refactor
  // behavior; the "responsive layout" describe block overrides per test.
  mockViewport(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FolderExplorerPage', () => {
  it('shows a not-found message instead of a blank/empty interactive page when the project does not exist or is not accessible', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    render(
      <MemoryRouter initialEntries={['/projects/p1/library']}>
        <Routes>
          <Route path="/projects/:projectKey/library" element={<FolderExplorerPage />} />
        </Routes>
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

  it('reflects folder depth in the breadcrumb, with Library as the root crumb', async () => {
    mockExplorerAPI()
    renderExplorer()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Banca Móvil')).toBeInTheDocument()
    expect(within(nav).getByText('Library')).toBeInTheDocument()
    expect(within(nav).getByText('Transferencias')).toBeInTheDocument()
  })

  it('shows "Library" as the current crumb when browsing the root itself', async () => {
    mockExplorerAPI()
    renderExplorer('/projects/p1/library/root')
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Library')).toBeInTheDocument()
    expect(within(nav).queryByText('Transferencias')).not.toBeInTheDocument()
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

  it('creates a test case with steps via the drawer', async () => {
    mockExplorerAPI()
    mockPOST.mockResolvedValue({ data: limitCase, response: { ok: true } })
    renderExplorer()
    await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')
    await userEvent.click(screen.getByRole('button', { name: /new test case/i }))
    await userEvent.type(screen.getByLabelText(/title/i), 'New case')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/cases',
        expect.objectContaining({
          params: { path: { projectKey: 'p1' } },
          body: expect.objectContaining({
            title: 'New case',
            folderId: 'transferencias',
            priority: 'medium',
            tags: [],
            platform: '',
            testType: '',
            automated: false,
          }),
        }),
      )
    })
  })

  it('creates a test case with classification fields set in the drawer', async () => {
    mockExplorerAPI()
    mockPOST.mockResolvedValue({ data: limitCase, response: { ok: true } })
    renderExplorer()
    await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')
    await userEvent.click(screen.getByRole('button', { name: /new test case/i }))
    const drawer = within(screen.getByRole('dialog', { name: /new test case/i }))
    await userEvent.type(drawer.getByLabelText(/title/i), 'New case')
    await userEvent.selectOptions(drawer.getByLabelText(/priority/i), 'critical')
    await userEvent.type(drawer.getByLabelText(/^tags/i), 'smoke, regression')
    await userEvent.type(drawer.getByLabelText(/platform/i), 'iOS')
    await userEvent.type(drawer.getByLabelText(/test type/i), 'unit')
    await userEvent.click(drawer.getByLabelText(/automated/i))
    await userEvent.click(drawer.getByRole('button', { name: /create test case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/cases',
        expect.objectContaining({
          body: expect.objectContaining({
            priority: 'critical',
            tags: ['smoke', 'regression'],
            platform: 'iOS',
            testType: 'unit',
            automated: true,
          }),
        }),
      )
    })
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
      await userEvent.click(within(caseRow).getByRole('menuitem', { name: /move to/i }))

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
      await userEvent.click(within(caseRow).getByRole('menuitem', { name: /move to/i }))
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
      await userEvent.click(within(caseRow).getByRole('menuitem', { name: /move to/i }))
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

  describe('row action menu (redesign-delete-mode-menu)', () => {
    it('shows no destructive-tinted "Delete mode" toggle in the toolbar at all', async () => {
      mockExplorerAPI()
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('button', { name: /delete mode/i })).not.toBeInTheDocument()
    })

    it("hides a folder row's action menu entirely without sectionDelete permission", async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, sectionDelete: false } })
      renderExplorer()
      await screen.findByRole('list', { name: 'Section contents' })
      expect(screen.queryByRole('button', { name: /actions for nacionales/i })).not.toBeInTheDocument()
    })

    it("still shows a case row's action menu without caseDelete permission, but without a Delete item", async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, caseDelete: false } })
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      expect(within(caseRow).getByRole('menuitem', { name: /move to/i })).toBeInTheDocument()
      expect(within(caseRow).queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it("a folder row's menu is closed by default and lists Delete once opened, with permission", async () => {
      mockExplorerAPI()
      renderExplorer()
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')).closest('li') as HTMLElement
      expect(within(folderRow).queryByRole('menuitem')).not.toBeInTheDocument()

      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for nacionales/i }))
      expect(within(folderRow).getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument()
    })

    it('deleting a case shows a confirmation naming it; canceling makes no request', async () => {
      mockExplorerAPI()
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      await userEvent.click(within(caseRow).getByRole('menuitem', { name: /^delete$/i }))

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
      await userEvent.click(within(caseRow).getByRole('menuitem', { name: /^delete$/i }))
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
      await userEvent.click(within(folderRow).getByRole('menuitem', { name: /^delete$/i }))

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

    it('canceling a folder delete confirmation makes no request and leaves the folder in place', async () => {
      mockExplorerAPI({ deletePreview: { caseCount: 0, folderCount: 0 } })
      renderExplorer()
      const folderRow = (await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')).closest('li') as HTMLElement
      await userEvent.click(within(folderRow).getByRole('button', { name: /actions for nacionales/i }))
      await userEvent.click(within(folderRow).getByRole('menuitem', { name: /^delete$/i }))
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
      await userEvent.click(within(folderRow).getByRole('menuitem', { name: /^delete$/i }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(/1 case and 1 subsection\./i)).toBeInTheDocument()
    })

    it('closing the delete confirmation via Escape makes no request', async () => {
      mockExplorerAPI()
      renderExplorer()
      const caseRow = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      await userEvent.click(within(caseRow).getByRole('button', { name: /actions for daily transfer limit/i }))
      await userEvent.click(within(caseRow).getByRole('menuitem', { name: /^delete$/i }))
      await screen.findByRole('dialog')

      await userEvent.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(mockDELETE).not.toHaveBeenCalled()
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
    it('shows priority, platform, and test type pills', async () => {
      mockExplorerAPI()
      renderExplorer()
      const row = (await screen.findByText('Daily transfer limit')).closest('li') as HTMLElement
      expect(within(row).getByText('high')).toBeInTheDocument()
      expect(within(row).getByText('web')).toBeInTheDocument()
      expect(within(row).getByText('e2e')).toBeInTheDocument()
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

    it('right-clicking a folder row without sectionDelete permission does nothing', async () => {
      mockExplorerAPI({ permissions: { ...allPermissions, sectionDelete: false } })
      renderExplorer()
      const folderRow = (
        await within(await screen.findByRole('list', { name: 'Section contents' })).findByText('Nacionales')
      ).closest('li') as HTMLElement
      await userEvent.pointer({ keys: '[MouseRight]', target: folderRow })
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })
})
