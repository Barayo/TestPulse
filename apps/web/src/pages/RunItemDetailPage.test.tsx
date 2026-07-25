import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import RunItemDetailPage from './RunItemDetailPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)

const run = {
  id: 'r1',
  key: 'r1',
  projectId: 'p1',
  projectKey: 'p1',
  name: 'Sprint 1',
  status: 'open' as const,
  createdAt: '',
}
const item = {
  id: 'i1',
  runId: 'r1',
  caseId: 'c1',
  caseKey: 'c1',
  caseVersion: 1,
  assignee: '',
  currentStatus: 'pending',
  newerVersion: false,
  testName: 'login_spec.ts::works',
  createdAt: '',
  content: {
    title: 'Login works',
    description: '',
    steps: [{ action: 'open login page', expected: 'form visible' }],
    expectedResult: 'user is logged in',
    priority: 'medium',
    tags: ['smoke'],
    platform: 'web',
    testType: 'e2e',
  },
}

function RunProbe() {
  const { runKey } = useParams<{ runKey?: string }>()
  return <p data-testid="run-probe">run {runKey ?? ''}</p>
}

function mockItemAPI(itemOverride?: unknown, runOverride?: unknown, results: unknown[] = []) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/runs/{runKey}') return Promise.resolve({ data: runOverride ?? run, response: { ok: true } })
    if (path === '/api/v1/runs/{runKey}/items')
      return Promise.resolve({ data: [itemOverride ?? item], response: { ok: true } })
    if (path === '/api/v1/items/{itemId}/results')
      return Promise.resolve({ data: results, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}')
      return Promise.resolve({
        data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function renderPage(path = '/runs/r1/items/c1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/runs/:runKey/items/:caseKey" element={<RunItemDetailPage />} />
        <Route path="/runs/:runKey" element={<RunProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('RunItemDetailPage', () => {
  it('shows the item heading, steps, and expected result', async () => {
    mockItemAPI()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Login works' })).toBeInTheDocument()
    expect(screen.getByText('open login page')).toBeInTheDocument()
    expect(screen.getByText('user is logged in')).toBeInTheDocument()
  })

  it('does not repeat the item title as the trailing breadcrumb crumb', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).queryByText('Login works')).not.toBeInTheDocument()
    expect(within(nav).getByText('Sprint 1')).toBeInTheDocument()
  })

  it('shows sidebar properties: status, test name, platform, tags, pinned version', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    const sidebar = screen.getByTestId('run-item-sidebar')
    expect(within(sidebar).getByText('pending')).toBeInTheDocument()
    expect(within(sidebar).getByText('login_spec.ts::works')).toBeInTheDocument()
    expect(within(sidebar).getByText('web')).toBeInTheDocument()
    expect(within(sidebar).getByText('smoke')).toBeInTheDocument()
    expect(within(sidebar).getByText('v1')).toBeInTheDocument()
  })

  it('shows the status property with a colored dot, not raw text alone', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    const sidebar = screen.getByTestId('run-item-sidebar')
    expect(sidebar.querySelector('[data-dot]')).not.toBeNull()
  })

  it('shows a newer-version hint when the case has moved on', async () => {
    mockItemAPI({ ...item, newerVersion: true })
    renderPage()
    expect(await screen.findByText(/newer version/i)).toBeInTheDocument()
  })

  it('back-arrow navigates to the run', async () => {
    mockItemAPI()
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: /back to sprint 1/i }))
    expect(await screen.findByTestId('run-probe')).toHaveTextContent('run r1')
  })

  it('records a verdict with comment on an open run', async () => {
    mockItemAPI()
    mockPOST.mockResolvedValue({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'pass', comment: 'all good', createdAt: '' },
      response: { ok: true },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    await userEvent.type(screen.getByLabelText(/comment/i), 'all good')
    await userEvent.click(screen.getByRole('button', { name: /^pass$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({
          params: { path: { itemId: 'i1' } },
          body: { verdict: 'pass', comment: 'all good' },
        }),
      )
    })
  })

  it('offers retest on a failed item', async () => {
    mockItemAPI({ ...item, currentStatus: 'failed' })
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /retest/i }))
    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/status',
        expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { status: 'retest' } }),
      )
    })
  })

  it('shows result history with a verdict dot, actor, comment, and relative time', async () => {
    mockItemAPI(undefined, undefined, [
      {
        id: 'res1',
        runItemId: 'i1',
        actor: 'ana',
        verdict: 'pass',
        comment: 'looks good',
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
      },
    ])
    renderPage()
    const history = await screen.findByText(/looks good/i)
    const row = history.closest('li')!
    expect(within(row).getByText('pass')).toBeInTheDocument()
    expect(row.querySelector('[data-dot]')).not.toBeNull()
    expect(within(row).getByText(/ana/)).toBeInTheDocument()
    expect(within(row).getByText(/hour ago/i)).toBeInTheDocument()
  })

  it('shows the item read-only, without verdict controls, on a closed run', async () => {
    mockItemAPI(undefined, { ...run, status: 'closed' })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    expect(screen.queryByRole('button', { name: /^pass$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/this run is closed/i)).toBeInTheDocument()
  })

  it('shows a not-found message when the item does not exist', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/runs/{runKey}') return Promise.resolve({ data: run, response: { ok: true } })
      if (path === '/api/v1/runs/{runKey}/items') return Promise.resolve({ data: [], response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
    renderPage()
    expect(await screen.findByText(/item not found/i)).toBeInTheDocument()
  })
})
