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

const case1 = {
  id: 'c1',
  key: 'p1-1',
  projectId: 'p1',
  folderId: 'root',
  currentVersion: 3,
  content: { title: 'Login works', description: '', steps: [], expectedResult: '', priority: 'medium', tags: ['auth'] },
  createdAt: '',
}
const case2 = {
  id: 'c2',
  key: 'p1-2',
  projectId: 'p1',
  folderId: 'root',
  currentVersion: 1,
  content: { title: 'Checkout works', description: '', steps: [], expectedResult: '', priority: 'high', tags: ['checkout'] },
  createdAt: '',
}

function mockSuitesAPI(cases: unknown[] = [], suites: unknown[] = []) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({
        data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectKey}/cases') return Promise.resolve({ data: cases, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/suites') return Promise.resolve({ data: suites, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderSuites(initialEntry = '/projects/p1/suites') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/projects/:projectKey/suites" element={<SuitesPage />} />
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

  it('creates a suite with cases selected in the same screen', async () => {
    mockSuitesAPI([case1, case2])
    mockPOST.mockResolvedValue({
      data: { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '' },
      response: { ok: true },
    })
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderSuites()

    await userEvent.type(await screen.findByLabelText(/suite name/i), 'Smoke')
    await userEvent.click(screen.getByRole('checkbox', { name: /login works/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /checkout works/i }))
    await userEvent.click(screen.getByRole('button', { name: /create suite \(2\)/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/suites',
        expect.objectContaining({ params: { path: { projectKey: 'p1' } }, body: { name: 'Smoke' } }),
      )
    })
    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}/cases/{caseKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1', caseKey: 'p1-1' } } }),
      )
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}/cases/{caseKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1', caseKey: 'p1-2' } } }),
      )
    })
  })

  it('create suite button stays disabled until a name is entered', async () => {
    mockSuitesAPI([case1])
    renderSuites()
    expect(await screen.findByRole('button', { name: /create suite \(0\)/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/suite name/i), 'Smoke')
    expect(screen.getByRole('button', { name: /create suite \(0\)/i })).toBeEnabled()
  })

  it('shows a clean list — suite name and case count only, no member cases until opened', async () => {
    mockSuitesAPI(
      [case1],
      [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
    )
    renderSuites()
    const list = await screen.findByRole('list', { name: 'Suites' })
    expect(within(list).getByText('Smoke')).toBeInTheDocument()
    expect(within(list).getByText(/1 case/i)).toBeInTheDocument()
    expect(within(list).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('opens the suite edit view when a suite row is clicked, pre-checked with its member cases', async () => {
    mockSuitesAPI(
      [case1, case2],
      [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
    )
    renderSuites()
    await userEvent.click(await screen.findByText('Smoke'))
    const dialog = await screen.findByRole('dialog', { name: 'Smoke' })
    expect(within(dialog).getByRole('checkbox', { name: /login works/i })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /checkout works/i })).not.toBeChecked()
  })

  it('editing membership commits only the net diff on save', async () => {
    mockSuitesAPI(
      [case1, case2],
      [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
    )
    mockPUT.mockResolvedValue({ response: { ok: true } })
    mockDELETE.mockResolvedValue({ response: { ok: true } })
    renderSuites()

    await userEvent.click(await screen.findByText('Smoke'))
    const dialog = await screen.findByRole('dialog', { name: 'Smoke' })
    const saveBtn = within(dialog).getByRole('button', { name: /save changes/i })
    expect(saveBtn).toBeDisabled()

    await userEvent.click(within(dialog).getByRole('checkbox', { name: /login works/i })) // uncheck existing member
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /checkout works/i })) // check a new one
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
    expect(mockPUT).toHaveBeenCalledTimes(1)
    expect(mockDELETE).toHaveBeenCalledTimes(1)
  })

  it('preserves a member case that no longer exists in the project (soft-deleted) — no DELETE call for it', async () => {
    mockSuitesAPI(
      [case1, case2],
      [{ id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: ['c1', 'orphan-id'], createdAt: '' }],
    )
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderSuites()

    await userEvent.click(await screen.findByText('Smoke'))
    const dialog = await screen.findByRole('dialog', { name: 'Smoke' })
    // Rendering a suite whose caseIds include an id absent from the project's
    // case list must not crash — and untouched (unrenderable) membership
    // must survive a save unaffected. Only check a new, unrelated case.
    expect(within(dialog).getByRole('checkbox', { name: /login works/i })).toBeChecked()
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /checkout works/i }))
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/suites/{suiteKey}/cases/{caseKey}',
        expect.objectContaining({ params: { path: { suiteKey: 'p1-S1', caseKey: 'p1-2' } } }),
      )
    })
    expect(mockDELETE).not.toHaveBeenCalled()
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
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderSuites()
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/suite name/i)).not.toBeInTheDocument()
  })

  it('auto-opens the suite edit view named in the URL hash, deep-linked from the landing panel', async () => {
    mockSuitesAPI(
      [],
      [
        { id: 's1', key: 'p1-S1', projectId: 'p1', name: 'Smoke', caseIds: [], createdAt: '' },
        { id: 's2', key: 'p1-S2', projectId: 'p1', name: 'Regression', caseIds: [], createdAt: '' },
      ],
    )
    renderSuites('/projects/p1/suites#suite-p1-S2')
    expect(await screen.findByRole('dialog', { name: 'Regression' })).toBeInTheDocument()
  })
})
