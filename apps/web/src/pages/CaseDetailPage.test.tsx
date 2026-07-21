import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CaseDetailPage from './CaseDetailPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(), PUT: vi.fn() },
}))
const mockGET = vi.mocked(api.GET)
const mockPUT = vi.mocked(api.PUT)

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

function mockDetailAPI() {
  mockGET.mockImplementation((path: string, options?: { params?: { path?: Record<string, string> } }) => {
    if (path === '/api/v1/projects/{projectId}')
      return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}/folders')
      return Promise.resolve({ data: [root, transferencias], response: { ok: true } })
    if (path === '/api/v1/cases/{caseId}' && options?.params?.path?.caseId === 'c1')
      return Promise.resolve({ data: limitCase, response: { ok: true } })
    if (path === '/api/v1/cases/{caseId}/versions' && options?.params?.path?.caseId === 'c1')
      return Promise.resolve({
        data: [
          { caseId: 'c1', version: 1, content: limitCase.content, createdAt: '2026-01-01T00:00:00Z' },
          { caseId: 'c1', version: 2, content: limitCase.content, createdAt: '2026-02-01T00:00:00Z' },
        ],
        response: { ok: true },
      })
    if (path === '/api/v1/projects/{projectId}/suites')
      return Promise.resolve({
        data: [{ id: 's1', projectId: 'p1', name: 'Smoke', caseIds: ['c1'], createdAt: '' }],
        response: { ok: true },
      })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function LibraryProbe() {
  return <p data-testid="library-probe">library</p>
}

function renderDetail(path = '/projects/p1/cases/c1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/cases/:caseId" element={<CaseDetailPage />} />
        <Route path="/projects/:projectId/library" element={<LibraryProbe />} />
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
      if (path === '/api/v1/projects/{projectId}')
        return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
      if (path === '/api/v1/cases/{caseId}')
        return Promise.resolve({ data: undefined, error: { error: 'not found' }, response: { ok: false } })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    renderDetail()
    expect(await screen.findByText(/case not found/i)).toBeInTheDocument()
    expect(screen.queryByText('Daily transfer limit')).not.toBeInTheDocument()
  })

  it('navigates to the Library when Close is clicked', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    await userEvent.click(screen.getByRole('button', { name: /^close$/i }))
    expect(await screen.findByTestId('library-probe')).toBeInTheDocument()
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
      if (path === '/api/v1/projects/{projectId}')
        return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectId}/folders')
        return Promise.resolve({ data: [root, transferencias], response: { ok: true } })
      if (path === '/api/v1/cases/{caseId}')
        return Promise.resolve({
          data: { ...limitCase, content: { ...limitCase.content, steps: [] } },
          response: { ok: true },
        })
      if (path === '/api/v1/cases/{caseId}/versions')
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

  it('renders properties as labeled Label: value pairs, except priority which is a badge', async () => {
    mockDetailAPI()
    renderDetail()
    await screen.findByRole('heading', { name: 'Daily transfer limit' })
    expect(screen.getByText('Test type')).toBeInTheDocument()
    expect(screen.getByText('e2e')).toBeInTheDocument()
    expect(screen.getByText('Automation')).toBeInTheDocument()
    expect(screen.getByText('Automated')).toBeInTheDocument()
    // priority is a badge, not a plain PropertyRow value
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
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
        '/api/v1/cases/{caseId}',
        expect.objectContaining({
          params: { path: { caseId: 'c1' } },
          body: expect.objectContaining({
            title: 'Daily transfer limit',
            steps: [{ action: 'Start a transfer above the daily limit', expected: 'Blocked before confirming' }],
          }),
        }),
      )
    })
  })

  it('refreshes the version history after saving an edit', async () => {
    let saved = false
    mockGET.mockImplementation((path: string, options?: { params?: { path?: Record<string, string> } }) => {
      if (path === '/api/v1/projects/{projectId}')
        return Promise.resolve({ data: { id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }, response: { ok: true } })
      if (path === '/api/v1/projects/{projectId}/folders')
        return Promise.resolve({ data: [root, transferencias], response: { ok: true } })
      if (path === '/api/v1/cases/{caseId}' && options?.params?.path?.caseId === 'c1')
        return Promise.resolve({
          data: saved ? { ...limitCase, currentVersion: 3 } : limitCase,
          response: { ok: true },
        })
      if (path === '/api/v1/cases/{caseId}/versions' && options?.params?.path?.caseId === 'c1')
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
      if (path === '/api/v1/projects/{projectId}/suites')
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
