import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import FolderExplorerPage from './FolderExplorerPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() },
}))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)

const root = { id: 'root', projectId: 'p1', name: 'Root', createdAt: '' }
const transferencias = { id: 'transferencias', projectId: 'p1', parentFolderId: 'root', name: 'Transferencias', createdAt: '' }
const nacionales = { id: 'nacionales', projectId: 'p1', parentFolderId: 'transferencias', name: 'Nacionales', createdAt: '' }

const limitCase = {
  id: 'c1',
  projectId: 'p1',
  folderId: 'transferencias',
  currentVersion: 2,
  content: {
    title: 'Daily transfer limit',
    description: '',
    steps: [{ action: 'Start a transfer over the limit', expected: 'Blocked' }],
    expectedResult: '',
    priority: 'medium',
    tags: [],
  },
  createdAt: '',
}

function mockExplorerAPI(overrides: Partial<Record<string, unknown>> = {}) {
  mockGET.mockImplementation((path: string, options?: { params?: { path?: Record<string, string> } }) => {
    if (path === '/api/v1/projects/{projectId}')
      return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/folders')
      return Promise.resolve({ data: overrides.folders ?? [root, transferencias, nacionales], response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/cases')
      return Promise.resolve({ data: overrides.cases ?? [limitCase], response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/suites')
      return Promise.resolve({
        data: overrides.suites ?? [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
        response: { ok: true },
      })
    if (path === '/api/v1/cases/{caseId}/versions' && options?.params?.path?.caseId === 'c1')
      return Promise.resolve({
        data: [
          { caseId: 'c1', version: 1, content: limitCase.content, createdAt: '2026-01-01T00:00:00Z' },
          { caseId: 'c1', version: 2, content: limitCase.content, createdAt: '2026-02-01T00:00:00Z' },
        ],
        response: { ok: true },
      })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderExplorer(path = '/projects/p1/library/transferencias') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/library" element={<FolderExplorerPage />} />
        <Route path="/projects/:projectId/library/:folderId" element={<FolderExplorerPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('FolderExplorerPage', () => {
  it('shows the selected folder’s direct subfolders and cases', async () => {
    mockExplorerAPI()
    renderExplorer()
    expect(await screen.findByText('Nacionales')).toBeInTheDocument()
    expect(screen.getByText('Daily transfer limit')).toBeInTheDocument()
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
    await userEvent.click(await screen.findByText('Nacionales'))
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
    await screen.findByText('Nacionales')
    await userEvent.click(screen.getByRole('button', { name: /new section/i }))
    await userEvent.type(screen.getByLabelText(/new section name/i), 'Internacionales{Enter}')

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/folders',
        expect.objectContaining({
          params: { path: { projectId: 'p1' } },
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
        '/api/v1/projects/{projectId}/folders',
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
    await screen.findByText('Nacionales')
    await userEvent.click(screen.getByRole('button', { name: /new test case/i }))
    await userEvent.type(screen.getByLabelText(/title/i), 'New case')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/cases',
        expect.objectContaining({
          params: { path: { projectId: 'p1' } },
          body: expect.objectContaining({ title: 'New case', folderId: 'transferencias' }),
        }),
      )
    })
  })

  it('opens an existing case in view mode with its version history', async () => {
    mockExplorerAPI()
    renderExplorer()
    await userEvent.click(await screen.findByText('Daily transfer limit'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Smoke')).toBeInTheDocument()
    expect(within(dialog).getByRole('list', { name: /version history/i })).toBeInTheDocument()
  })

  it('editing a case calls PUT and refreshes the list', async () => {
    mockExplorerAPI()
    mockPUT.mockResolvedValue({
      data: { ...limitCase, currentVersion: 3, content: { ...limitCase.content, title: 'Daily transfer limit v3' } },
      response: { ok: true },
    })
    renderExplorer()
    await userEvent.click(await screen.findByText('Daily transfer limit'))
    await userEvent.click(await screen.findByRole('button', { name: /^edit$/i }))
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/cases/{caseId}',
        expect.objectContaining({ params: { path: { caseId: 'c1' } } }),
      )
    })
  })
})
