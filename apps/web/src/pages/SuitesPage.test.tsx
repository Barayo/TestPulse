import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SuitesPage from './SuitesPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

const testCase = {
  id: 'c1',
  projectId: 'p1',
  folderId: 'root',
  currentVersion: 3,
  content: { title: 'Login works', description: '', steps: [], expectedResult: '', priority: 'medium', tags: [] },
  createdAt: '',
}

function mockSuitesAPI(cases: unknown[] = [], suites: unknown[] = []) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectId}')
      return Promise.resolve({
        data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectId}/cases') return Promise.resolve({ data: cases, response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/suites') return Promise.resolve({ data: suites, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderSuites(initialEntry = '/projects/p1/suites') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/projects/:projectId/suites" element={<SuitesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('SuitesPage', () => {
  it('shows a breadcrumb: Projects > project name > Suites', async () => {
    mockSuitesAPI()
    renderSuites()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(await screen.findByText('QA Platform')).toBeInTheDocument()
    expect(nav).toHaveTextContent('Suites')
  })

  it('creates a suite via the plain form', async () => {
    mockSuitesAPI()
    mockPOST.mockResolvedValue({
      data: { id: 's1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '' },
      response: { ok: true },
    })
    renderSuites()

    await userEvent.type(await screen.findByLabelText(/suite name/i), 'Smoke')
    await userEvent.click(screen.getByRole('button', { name: /create suite/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectId}/suites',
        expect.objectContaining({ params: { path: { projectId: 'p1' } }, body: { name: 'Smoke' } }),
      )
    })
  })

  it('shows a clean list — suite name and case count only, no member cases until opened', async () => {
    mockSuitesAPI(
      [testCase],
      [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
    )
    renderSuites()
    expect(await screen.findByText('Smoke')).toBeInTheDocument()
    expect(screen.getByText(/1 case/i)).toBeInTheDocument()
    expect(screen.queryByText('Login works')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('opens the suite drawer when a suite row is clicked, showing its member cases', async () => {
    mockSuitesAPI(
      [testCase],
      [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
    )
    renderSuites()
    await userEvent.click(await screen.findByText('Smoke'))
    expect(await screen.findByRole('dialog', { name: 'Smoke' })).toBeInTheDocument()
    expect(screen.getByText('Login works')).toBeInTheDocument()
  })

  it('adds a case to a suite from within the drawer', async () => {
    mockSuitesAPI([testCase], [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '' }])
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderSuites()

    await userEvent.click(await screen.findByText('Smoke'))
    const dialog = await screen.findByRole('dialog', { name: 'Smoke' })
    await userEvent.click(within(dialog).getByRole('button', { name: /add case/i }))
    await userEvent.click(await screen.findByText('Login works'))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteId}/cases/{caseId}',
        expect.objectContaining({ params: { path: { suiteId: 's1', caseId: 'c1' } } }),
      )
    })
  })

  it('removes a case from a suite from within the drawer', async () => {
    mockSuitesAPI([testCase], [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }])
    mockDELETE.mockResolvedValue({ response: { ok: true } })
    renderSuites()

    await userEvent.click(await screen.findByText('Smoke'))
    const dialog = await screen.findByRole('dialog', { name: 'Smoke' })
    await userEvent.click(within(dialog).getByRole('button', { name: /remove login works/i }))

    await waitFor(() => {
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteId}/cases/{caseId}',
        expect.objectContaining({ params: { path: { suiteId: 's1', caseId: 'c1' } } }),
      )
    })
  })

  it('falls back to the raw id when a suite references an unknown case', async () => {
    mockSuitesAPI([], [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['orphan-id'], createdAt: '' }])
    renderSuites()
    await userEvent.click(await screen.findByText('Smoke'))
    expect(await screen.findByText('orphan-id')).toBeInTheDocument()
  })

  it('shows empty-state copy when there are no suites yet', async () => {
    mockSuitesAPI([])
    renderSuites()
    expect(await screen.findByText(/no suites yet/i)).toBeInTheDocument()
  })

  it('recovers gracefully when the API is unreachable', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    renderSuites()
    expect(await screen.findByText(/no suites yet/i)).toBeInTheDocument()
  })

  it('shows a not-found message instead of an empty, interactive project when the project does not exist', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectId}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderSuites()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create suite/i })).not.toBeInTheDocument()
  })

  it('auto-opens the suite drawer named in the URL hash, deep-linked from the landing panel', async () => {
    mockSuitesAPI(
      [],
      [
        { id: 's1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '' },
        { id: 's2', projectId: 'p1', name: 'Regression', caseIds: [], createdAt: '' },
      ],
    )
    renderSuites('/projects/p1/suites#suite-s2')
    expect(await screen.findByRole('dialog', { name: 'Regression' })).toBeInTheDocument()
  })
})
