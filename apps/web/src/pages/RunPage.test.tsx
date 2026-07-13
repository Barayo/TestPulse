import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RunPage from './RunPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)

const run = { id: 'r1', projectId: 'p1', name: 'Sprint 1', createdAt: '' }
const pendingItem = {
  id: 'i1',
  runId: 'r1',
  caseId: 'c1',
  caseVersion: 1,
  assignee: '',
  currentStatus: 'pending',
  newerVersion: false,
  createdAt: '',
  content: {
    title: 'Login works',
    description: '',
    steps: [{ action: 'open login page', expected: 'form visible' }],
    expectedResult: 'user is logged in',
    priority: 'medium',
    tags: [],
  },
}

function mockRunAPI(items: unknown[], summary?: unknown) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/runs/{runId}') return Promise.resolve({ data: run, response: { ok: true } })
    if (path === '/api/v1/runs/{runId}/items')
      return Promise.resolve({ data: items, response: { ok: true } })
    if (path === '/api/v1/runs/{runId}/summary')
      return Promise.resolve({
        data: summary ?? { runId: 'r1', total: items.length, counts: { pending: items.length } },
        response: { ok: true },
      })
    if (path === '/api/v1/items/{itemId}/results')
      return Promise.resolve({ data: [], response: { ok: true } })
    if (path === '/api/v1/projects/{projectId}')
      return Promise.resolve({
        data: { id: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
        response: { ok: true },
      })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function renderRun() {
  return render(
    <MemoryRouter initialEntries={['/runs/r1']}>
      <Routes>
        <Route path="/runs/:runId" element={<RunPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('Run execution board', () => {
  it('shows a breadcrumb with Projects, the project name, and the run name', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/')
    expect(await within(nav).findByText('QA Platform')).toBeInTheDocument()
    expect(within(nav).getByText('Sprint 1')).toBeInTheDocument()
  })

  it('shows run items with status chips and summary', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    expect(await screen.findByText('Login works')).toBeInTheDocument()
    expect(screen.getAllByText(/pending/i).length).toBeGreaterThan(0)
  })

  it('renders the item status chip via the shared StatusBadge (with its dot indicator)', async () => {
    mockRunAPI([pendingItem])
    const { container } = renderRun()
    await screen.findByText('Login works')
    expect(container.querySelector('[data-dot]')).not.toBeNull()
  })

  it('opens the pinned case detail with steps and expected result', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    await userEvent.click(await screen.findByText('Login works'))
    expect(await screen.findByText('open login page')).toBeInTheDocument()
    expect(screen.getByText('user is logged in')).toBeInTheDocument()
  })

  it('records a verdict with comment from the board', async () => {
    mockRunAPI([pendingItem])
    mockPOST.mockResolvedValue({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'pass', comment: '', createdAt: '' },
      response: { ok: true },
    })
    renderRun()

    await userEvent.click(await screen.findByText('Login works'))
    await userEvent.type(screen.getByLabelText(/your name/i), 'ana')
    await userEvent.type(screen.getByLabelText(/comment/i), 'all good')
    await userEvent.click(screen.getByRole('button', { name: /^pass$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({
          params: { path: { itemId: 'i1' } },
          body: { actor: 'ana', verdict: 'pass', comment: 'all good' },
        }),
      )
    })
  })

  it('requires actor name before recording a verdict', async () => {
    mockRunAPI([pendingItem])
    renderRun()
    await userEvent.click(await screen.findByText('Login works'))
    await userEvent.click(screen.getByRole('button', { name: /^pass$/i }))
    expect(await screen.findByText(/your name is required/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('renders steps without an expected-result line when none is set', async () => {
    const bare = {
      ...pendingItem,
      content: { ...pendingItem.content, expectedResult: '', steps: [{ action: 'just do it' }] },
    }
    mockRunAPI([bare])
    renderRun()
    await userEvent.click((await screen.findAllByText('Login works'))[0])
    expect(screen.getByText('just do it')).toBeInTheDocument()
    expect(screen.queryByText(/expected result/i)).not.toBeInTheDocument()
  })

  it('shows the newer-version hint on outdated pins', async () => {
    mockRunAPI([{ ...pendingItem, newerVersion: true }])
    renderRun()
    expect(await screen.findByText(/newer version/i)).toBeInTheDocument()
  })

  it('shows the result in history immediately after recording it, without re-selecting', async () => {
    mockRunAPI([pendingItem])
    // Server state changes only once the POST actually happens — mirroring
    // a real backend, unlike a mock that returns the post-verdict state from
    // the very first (pre-verdict) fetch.
    let recorded = false
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/runs/{runId}') return Promise.resolve({ data: run, response: { ok: true } })
      if (path === '/api/v1/runs/{runId}/items')
        return Promise.resolve({
          data: [{ ...pendingItem, currentStatus: recorded ? 'failed' : 'pending' }],
          response: { ok: true },
        })
      if (path === '/api/v1/runs/{runId}/summary')
        return Promise.resolve({
          data: { runId: 'r1', total: 1, counts: recorded ? { failed: 1 } : { pending: 1 } },
          response: { ok: true },
        })
      if (path === '/api/v1/items/{itemId}/results')
        return Promise.resolve({
          data: recorded
            ? [{ id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'failed', comment: '', createdAt: '' }]
            : [],
          response: { ok: true },
        })
      return Promise.resolve({ data: [], response: { ok: true } })
    })
    mockPOST.mockImplementation(() => {
      recorded = true
      return Promise.resolve({
        data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'failed', comment: '', createdAt: '' },
        response: { ok: true },
      })
    })
    renderRun()

    await userEvent.click(await screen.findByText('Login works'))
    expect(screen.queryByText(/ana: failed/i)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/your name/i), 'ana')
    await userEvent.click(screen.getByRole('button', { name: /^failed$/i }))

    // No re-selection here — the board must refresh on its own.
    expect(await screen.findByText(/ana: failed/i)).toBeInTheDocument()

    // Blocked and skipped verdicts use the same POST path.
    await userEvent.click(screen.getByRole('button', { name: /^blocked$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^skipped$/i }))
    await waitFor(() => expect(mockPOST).toHaveBeenCalledTimes(3))
  })

  it('recovers gracefully when the API is unreachable', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    renderRun()
    await waitFor(() => expect(mockGET).toHaveBeenCalled())
    expect(screen.queryByText('Login works')).not.toBeInTheDocument()
  })

  it('offers retest on failed items', async () => {
    mockRunAPI([{ ...pendingItem, currentStatus: 'failed' }])
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderRun()

    await userEvent.click(await screen.findByText('Login works'))
    const detail = await screen.findByTestId('item-detail')
    await userEvent.click(within(detail).getByRole('button', { name: /retest/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/status',
        expect.objectContaining({
          params: { path: { itemId: 'i1' } },
          body: { status: 'retest' },
        }),
      )
    })
  })
})
