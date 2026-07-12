import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProjectPage from './ProjectPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

const rootFolder = { id: 'root', projectId: 'p1', name: 'Root', createdAt: '' }

const testCase = {
  id: 'c1',
  projectId: 'p1',
  folderId: 'root',
  currentVersion: 3,
  content: { title: 'Login works', description: '', steps: [], expectedResult: '', priority: 'medium', tags: [] },
  createdAt: '',
}

function mockProjectAPI(
  cases: unknown[] = [],
  suites: unknown[] = [],
  runs: unknown[] = [],
  folders: unknown[] = [rootFolder],
) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectId}/cases') return Promise.resolve({ data: cases, response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/suites') return Promise.resolve({ data: suites, response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/runs') return Promise.resolve({ data: runs, response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/folders') return Promise.resolve({ data: folders, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderProject() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1']}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ProjectPage', () => {
  it('edits a case, creating a new version', async () => {
    mockProjectAPI([testCase])
    mockPUT.mockResolvedValue({
      data: { ...testCase, currentVersion: 4, content: { ...testCase.content, title: 'Login works v4' } },
      response: { ok: true },
    })
    renderProject()

    await userEvent.click(await screen.findByRole('button', { name: /edit/i }))
    const titleInput = screen.getByDisplayValue('Login works')
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Login works v4')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/cases/{caseId}',
        expect.objectContaining({
          params: { path: { caseId: 'c1' } },
          body: expect.objectContaining({ title: 'Login works v4' }),
        }),
      )
    })
  })

  it('does not save an edit with an empty title', async () => {
    mockProjectAPI([testCase])
    renderProject()

    await userEvent.click(await screen.findByRole('button', { name: /edit/i }))
    await userEvent.clear(screen.getByLabelText('Edit title'))
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(mockPUT).not.toHaveBeenCalled()
  })

  it('does not add a case to a suite without a selection', async () => {
    mockProjectAPI(
      [testCase],
      [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '' }],
    )
    renderProject()
    await screen.findByText(/Smoke/)
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(mockPUT).not.toHaveBeenCalled()
  })

  it('falls back to the raw id when a suite references an unknown case', async () => {
    mockProjectAPI(
      [],
      [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['orphan-id'], createdAt: '' }],
    )
    renderProject()
    expect(await screen.findByText('orphan-id')).toBeInTheDocument()
  })

  it('cancels a case edit without saving', async () => {
    mockProjectAPI([testCase])
    renderProject()

    await userEvent.click(await screen.findByRole('button', { name: /edit/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByDisplayValue('Login works')).not.toBeInTheDocument()
    expect(mockPUT).not.toHaveBeenCalled()
  })

  it('creates a suite via the plain form', async () => {
    mockProjectAPI([])
    mockPOST.mockResolvedValue({
      data: { id: 's1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '' },
      response: { ok: true },
    })
    renderProject()

    await userEvent.type(await screen.findByLabelText(/suite name/i), 'Smoke')
    await userEvent.click(screen.getByRole('button', { name: /create suite/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/suites',
        expect.objectContaining({
          params: { path: { projectId: 'p1' } },
          body: { name: 'Smoke' },
        }),
      )
    })
  })

  it('adds a case to a suite and can remove it', async () => {
    mockProjectAPI(
      [testCase],
      [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '' }],
    )
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderProject()

    await screen.findByText(/Smoke/)
    await userEvent.selectOptions(screen.getByLabelText(/add case to smoke/i), 'c1')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteId}/cases/{caseId}',
        expect.objectContaining({ params: { path: { suiteId: 's1', caseId: 'c1' } } }),
      )
    })
  })

  it('removes a case from a suite', async () => {
    mockProjectAPI(
      [testCase],
      [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
    )
    mockDELETE.mockResolvedValue({ response: { ok: true } })
    renderProject()

    await screen.findByText(/Smoke/)
    await userEvent.click(screen.getByRole('button', { name: /remove login works/i }))

    await waitFor(() => {
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteId}/cases/{caseId}',
        expect.objectContaining({ params: { path: { suiteId: 's1', caseId: 'c1' } } }),
      )
    })
  })

  it('shows the current version badge for each case', async () => {
    mockProjectAPI([testCase])
    renderProject()
    expect(await screen.findByText('Login works')).toBeInTheDocument()
    expect(screen.getByText('v3')).toBeInTheDocument()
  })

  it('creates a case via the plain form', async () => {
    mockProjectAPI([])
    mockPOST.mockResolvedValue({ data: testCase, response: { ok: true } })
    renderProject()

    await userEvent.type(await screen.findByLabelText(/title/i), 'Login works')
    await userEvent.click(screen.getByRole('button', { name: /create case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/cases',
        expect.objectContaining({
          params: { path: { projectId: 'p1' } },
          body: { title: 'Login works' },
        }),
      )
    })
  })

  it('shows the server error when case creation fails', async () => {
    mockProjectAPI([])
    mockPOST.mockResolvedValue({ error: { error: 'duplicate title' }, response: { ok: false } })
    renderProject()

    await userEvent.type(await screen.findByLabelText(/title/i), 'Dup')
    await userEvent.click(screen.getByRole('button', { name: /create case/i }))
    expect(await screen.findByText('duplicate title')).toBeInTheDocument()
  })

  it('rejects an empty case title', async () => {
    mockProjectAPI([])
    renderProject()
    await userEvent.click(await screen.findByRole('button', { name: /create case/i }))
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('lists suites with their case count and runs as links', async () => {
    mockProjectAPI(
      [testCase],
      [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
      [{ id: 'r1', projectId: 'p1', name: 'Sprint 1', createdAt: '' }],
    )
    renderProject()
    expect(await screen.findByText(/Smoke/)).toBeInTheDocument()
    expect(screen.getByText(/1 cases/)).toBeInTheDocument()
    const runLink = screen.getByRole('link', { name: 'Sprint 1' })
    expect(runLink).toHaveAttribute('href', '/runs/r1')
  })

  it('shows empty-state copy when there are no suites or runs yet', async () => {
    mockProjectAPI([])
    renderProject()
    await screen.findByText(/no test cases yet/i)
    expect(screen.getByText(/no suites yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
  })

  it('creates a run including all current cases', async () => {
    mockProjectAPI([testCase])
    mockPOST.mockResolvedValue({
      data: { id: 'r2', projectId: 'p1', name: 'Sprint 2', createdAt: '' },
      response: { ok: true },
    })
    renderProject()

    await screen.findByText('Login works')
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Sprint 2')
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/runs',
        expect.objectContaining({
          params: { path: { projectId: 'p1' } },
          body: { name: 'Sprint 2', caseIds: ['c1'] },
        }),
      )
    })
  })

  it('does not submit a run without a name', async () => {
    mockProjectAPI([testCase])
    renderProject()
    await screen.findByText('Login works')
    await userEvent.click(screen.getByRole('button', { name: /create run/i }))
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('recovers gracefully when the API is unreachable', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    renderProject()
    expect(await screen.findByText(/no test cases yet/i)).toBeInTheDocument()
  })

  it('creates a case without picking a folder — defaults to root at the API', async () => {
    mockProjectAPI([])
    mockPOST.mockResolvedValue({ data: testCase, response: { ok: true } })
    renderProject()

    await userEvent.type(await screen.findByLabelText(/title/i), 'Login works')
    await userEvent.click(screen.getByRole('button', { name: /create case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/cases',
        expect.objectContaining({
          params: { path: { projectId: 'p1' } },
          body: { title: 'Login works' },
        }),
      )
    })
  })

  it('creates a case in a specifically chosen folder', async () => {
    const auth = { id: 'auth', projectId: 'p1', parentFolderId: 'root', name: 'Auth', createdAt: '' }
    mockProjectAPI([], [], [], [rootFolder, auth])
    mockPOST.mockResolvedValue({ data: testCase, response: { ok: true } })
    renderProject()

    await userEvent.type(await screen.findByLabelText(/title/i), 'Login works')
    await userEvent.selectOptions(screen.getByLabelText('Folder'), 'auth')
    await userEvent.click(screen.getByRole('button', { name: /create case/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/cases',
        expect.objectContaining({
          body: { title: 'Login works', folderId: 'auth' },
        }),
      )
    })
  })

  it('creates a subfolder, defaulting its parent to root', async () => {
    mockProjectAPI([])
    mockPOST.mockResolvedValue({
      data: { id: 'auth', projectId: 'p1', parentFolderId: 'root', name: 'Auth', createdAt: '' },
      response: { ok: true },
    })
    renderProject()

    await userEvent.type(await screen.findByLabelText(/new folder name/i), 'Auth')
    await userEvent.click(screen.getByRole('button', { name: /create folder/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/folders',
        expect.objectContaining({
          params: { path: { projectId: 'p1' } },
          body: { name: 'Auth', parentFolderId: 'root' },
        }),
      )
    })
  })

  it('rejects an empty folder name', async () => {
    mockProjectAPI([])
    renderProject()
    await screen.findByLabelText(/new folder name/i)
    await userEvent.click(screen.getByRole('button', { name: /create folder/i }))
    expect(await screen.findByText(/folder name is required/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })
})
