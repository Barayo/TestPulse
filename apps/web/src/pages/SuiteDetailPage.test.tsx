import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SuiteDetailPage from './SuiteDetailPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

let navigatedTo: string | undefined
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => (to: string) => {
      navigatedTo = to
    },
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

function mockDetailAPI(suite: unknown = smokeSuite, cases: unknown[] = [case1, case2]) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: projectQA, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/cases') return Promise.resolve({ data: cases, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/folders') return Promise.resolve({ data: folders, response: { ok: true } })
    if (path === '/api/v1/suites/{suiteKey}') return Promise.resolve({ data: suite, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/suites/p1-S1']}>
      <Routes>
        <Route path="/projects/:projectKey/suites/:suiteKey" element={<SuiteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  navigatedTo = undefined
})

describe('SuiteDetailPage', () => {
  it('shows a breadcrumb ending at the suite name', async () => {
    mockDetailAPI()
    renderDetail()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(nav).toHaveTextContent('Suites')
    expect(nav).toHaveTextContent('Smoke')
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

  it('renames the suite', async () => {
    mockDetailAPI()
    mockPUT.mockResolvedValue({ data: { ...smokeSuite, name: 'Smoke v2' }, response: { ok: true } })
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: /rename/i }))
    const input = screen.getByLabelText(/suite name/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'Smoke v2')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1' } }, body: { name: 'Smoke v2' } }),
      )
    })
  })

  it('deletes the suite and returns to the index', async () => {
    mockDetailAPI()
    mockDELETE.mockResolvedValue({ response: { ok: true } })
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => {
      expect(mockDELETE).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1' } } }),
      )
    })
    await waitFor(() => expect(navigatedTo).toBe('/projects/p1/suites'))
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

  it('shows a not-found message for an unknown suite key', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: projectQA, response: { ok: true } })
      if (path === '/api/v1/suites/{suiteKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderDetail()
    expect(await screen.findByText(/suite not found/i)).toBeInTheDocument()
  })
})
