import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
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
  assignee: null,
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

function mockItemAPI(itemOverride?: unknown, runOverride?: unknown, results: unknown[] = [], itemsOverride?: unknown[]) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/runs/{runKey}') return Promise.resolve({ data: runOverride ?? run, response: { ok: true } })
    if (path === '/api/v1/runs/{runKey}/items')
      return Promise.resolve({ data: itemsOverride ?? [itemOverride ?? item], response: { ok: true } })
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

  it('clicking Pass repeatedly before the request resolves only records one verdict', async () => {
    mockItemAPI()
    let resolvePost: (value: unknown) => void = () => {}
    mockPOST.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve
        }),
    )
    renderPage()
    const passButton = await screen.findByRole('button', { name: /^pass$/i })

    await userEvent.click(passButton)
    await userEvent.click(passButton)
    await userEvent.click(passButton)

    expect(mockPOST).toHaveBeenCalledTimes(1)
    resolvePost({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'pass', comment: '', createdAt: '' },
      response: { ok: true },
    })
  })

  it('disables the verdict buttons while a recording is in flight', async () => {
    mockItemAPI()
    let resolvePost: (value: unknown) => void = () => {}
    mockPOST.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve
        }),
    )
    renderPage()
    const passButton = await screen.findByRole('button', { name: /^pass$/i })
    await userEvent.click(passButton)

    expect(screen.getByRole('button', { name: /^pass$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^failed$/i })).toBeDisabled()

    resolvePost({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'pass', comment: '', createdAt: '' },
      response: { ok: true },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /^pass$/i })).not.toBeDisabled())
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

  it('shows an Avatar for a user-attributed history entry, resolving their current avatarKey (add-user-profile)', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/runs/{runKey}') return Promise.resolve({ data: run, response: { ok: true } })
      if (path === '/api/v1/runs/{runKey}/items') return Promise.resolve({ data: [item], response: { ok: true } })
      if (path === '/api/v1/items/{itemId}/results')
        return Promise.resolve({
          data: [
            {
              id: 'res1',
              runItemId: 'i1',
              actor: 'ana@example.com',
              actorKind: 'user',
              actorRefId: 'u-ana',
              verdict: 'pass',
              comment: '',
              createdAt: new Date().toISOString(),
            },
          ],
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({
          data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/users')
        return Promise.resolve({
          data: [{ id: 'u-ana', email: 'ana@example.com', isTenantAdmin: false, avatarKey: 'ada-lovelace', createdAt: '' }],
          response: { ok: true },
        })
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
    renderPage()
    const history = await screen.findByText(/ana@example.com/i)
    const row = history.closest('li')!
    const img = within(row).getByRole('img')
    expect(img.getAttribute('src')).toMatch(/ada-lovelace/)
  })

  it('shows the item read-only, without verdict controls, on a closed run', async () => {
    mockItemAPI(undefined, { ...run, status: 'closed' })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    expect(screen.queryByRole('button', { name: /^pass$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/this run is closed/i)).toBeInTheDocument()
  })

  it('offers a Save comment button once a prior verdict exists, which resubmits that verdict with the new comment', async () => {
    mockItemAPI({ ...item, currentStatus: 'failed' }, undefined, [
      { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'failed', comment: '', createdAt: '' },
    ])
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    await userEvent.type(screen.getByLabelText(/comment/i), 'still failing after retry')
    await userEvent.click(screen.getByRole('button', { name: /save comment/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({
          params: { path: { itemId: 'i1' } },
          body: { verdict: 'failed', comment: 'still failing after retry' },
        }),
      )
    })
    expect(screen.getByLabelText(/comment/i)).toHaveValue('')
  })

  it('disables Save comment until a comment is typed', async () => {
    mockItemAPI({ ...item, currentStatus: 'failed' }, undefined, [
      { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'failed', comment: '', createdAt: '' },
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    expect(screen.getByRole('button', { name: /save comment/i })).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/comment/i), 'a note')
    expect(screen.getByRole('button', { name: /save comment/i })).not.toBeDisabled()
  })

  it('has no Save comment button and shows a hint instead when the item has no prior verdict yet', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    expect(screen.queryByRole('button', { name: /save comment/i })).not.toBeInTheDocument()
    expect(screen.getByText(/saved together with a verdict/i)).toBeInTheDocument()
  })

  it('Ctrl/Cmd+Enter in the comment field saves the comment when a prior verdict exists', async () => {
    mockItemAPI({ ...item, currentStatus: 'failed' }, undefined, [
      { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'failed', comment: '', createdAt: '' },
    ])
    mockPOST.mockResolvedValue({ response: { ok: true } })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    await userEvent.type(screen.getByLabelText(/comment/i), 'still failing after retry')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({
          params: { path: { itemId: 'i1' } },
          body: { verdict: 'failed', comment: 'still failing after retry' },
        }),
      )
    })
  })

  it('Ctrl/Cmd+Enter does nothing when there is no prior verdict to save the comment against', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    await userEvent.type(screen.getByLabelText(/comment/i), 'a note')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    expect(mockPOST).not.toHaveBeenCalled()
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

describe('Keyboard shortcuts (add-run-keyboard-shortcuts)', () => {
  it('pressing P twice before the request resolves only records one verdict', async () => {
    mockItemAPI()
    let resolvePost: (value: unknown) => void = () => {}
    mockPOST.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve
        }),
    )
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.keyboard('pp')

    expect(mockPOST).toHaveBeenCalledTimes(1)
    resolvePost({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'pass', comment: '', createdAt: '' },
      response: { ok: true },
    })
  })

  it('pressing F records a failed verdict, the same as clicking the Failed button', async () => {
    mockItemAPI()
    mockPOST.mockResolvedValue({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'failed', comment: '', createdAt: '' },
      response: { ok: true },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.keyboard('f')

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({
          params: { path: { itemId: 'i1' } },
          body: { verdict: 'failed', comment: '' },
        }),
      )
    })
  })

  it('pressing R marks retest when the item is failed', async () => {
    mockItemAPI({ ...item, currentStatus: 'failed' })
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.keyboard('r')

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/status',
        expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { status: 'retest' } }),
      )
    })
  })

  it('pressing R does nothing when the item is not failed, and the hint omits R', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.keyboard('r')

    expect(mockPUT).not.toHaveBeenCalled()
    const hint = screen.getByLabelText('Keyboard shortcuts')
    expect(within(hint).queryByText('R')).not.toBeInTheDocument()
  })

  it('recording a verdict navigates to the next pending item in the run', async () => {
    const nextItem = {
      ...item,
      id: 'i2',
      caseKey: 'c2',
      currentStatus: 'pending',
      content: { ...item.content, title: 'Checkout works' },
    }
    mockItemAPI(undefined, undefined, [], [item, nextItem])
    mockPOST.mockResolvedValue({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'failed', comment: '', createdAt: '' },
      response: { ok: true },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.keyboard('f')

    expect(await screen.findByRole('heading', { name: 'Checkout works' })).toBeInTheDocument()
  })

  it('clicking the on-screen Pass button does not auto-advance, unlike its keyboard shortcut', async () => {
    const nextItem = {
      ...item,
      id: 'i2',
      caseKey: 'c2',
      currentStatus: 'pending',
      content: { ...item.content, title: 'Checkout works' },
    }
    mockItemAPI(undefined, undefined, [], [item, nextItem])
    mockPOST.mockResolvedValue({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'pass', comment: '', createdAt: '' },
      response: { ok: true },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.click(screen.getByRole('button', { name: /^pass$/i }))

    await waitFor(() => expect(mockPOST).toHaveBeenCalled())
    expect(screen.getByRole('heading', { name: 'Login works' })).toBeInTheDocument()
  })

  it('recording the last pending item\'s verdict navigates back to the run', async () => {
    mockItemAPI(undefined, undefined, [], [item])
    mockPOST.mockResolvedValue({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'failed', comment: '', createdAt: '' },
      response: { ok: true },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.keyboard('f')

    expect(await screen.findByTestId('run-probe')).toHaveTextContent('run r1')
  })

  it('j/k navigates to the next/previous item in run order regardless of status', async () => {
    const passItem = {
      ...item,
      id: 'i2',
      caseKey: 'c2',
      currentStatus: 'pass',
      content: { ...item.content, title: 'Checkout works' },
    }
    mockItemAPI(undefined, undefined, [], [item, passItem])
    renderPage('/runs/r1/items/c1')
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.keyboard('j')
    expect(await screen.findByRole('heading', { name: 'Checkout works' })).toBeInTheDocument()

    await userEvent.keyboard('k')
    expect(await screen.findByRole('heading', { name: 'Login works' })).toBeInTheDocument()
  })

  it('ArrowDown/ArrowUp navigate items the same as j/k', async () => {
    const passItem = {
      ...item,
      id: 'i2',
      caseKey: 'c2',
      currentStatus: 'pass',
      content: { ...item.content, title: 'Checkout works' },
    }
    mockItemAPI(undefined, undefined, [], [item, passItem])
    renderPage('/runs/r1/items/c1')
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.keyboard('{ArrowDown}')
    expect(await screen.findByRole('heading', { name: 'Checkout works' })).toBeInTheDocument()

    await userEvent.keyboard('{ArrowUp}')
    expect(await screen.findByRole('heading', { name: 'Login works' })).toBeInTheDocument()
  })

  it('shortcut keys typed into the comment field do not record a verdict', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.type(screen.getByLabelText(/comment/i), 'f is for failed')

    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('shortcut keys typed into the actor-override field do not record a verdict', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })
    await userEvent.click(screen.getByRole('button', { name: /record on behalf of someone else/i }))

    await userEvent.type(screen.getByLabelText(/record on behalf of/i), 'bob')

    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('shows a persistent shortcuts hint and opens an overlay with ?', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    expect(screen.getByLabelText('Keyboard shortcuts')).toBeInTheDocument()

    await userEvent.keyboard('?')

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('Assignment (add-run-item-assignment-ui)', () => {
  function mockAssignmentAPI(itemOverride?: unknown) {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/runs/{runKey}') return Promise.resolve({ data: run, response: { ok: true } })
      if (path === '/api/v1/runs/{runKey}/items')
        return Promise.resolve({ data: [itemOverride ?? item], response: { ok: true } })
      if (path === '/api/v1/items/{itemId}/results') return Promise.resolve({ data: [], response: { ok: true } })
      if (path === '/api/v1/projects/{projectKey}')
        return Promise.resolve({
          data: { id: 'p1', key: 'p1', name: 'QA Platform', archived: false, createdAt: '' },
          response: { ok: true },
        })
      if (path === '/api/v1/projects/{projectKey}/members')
        return Promise.resolve({ data: { users: [{ userId: 'u-ana', roleId: 'role-tester' }], teams: [] }, response: { ok: true } })
      if (path === '/api/v1/users')
        return Promise.resolve({
          data: [{ id: 'u-ana', email: 'ana@example.com', isTenantAdmin: false, createdAt: '' }],
          response: { ok: true },
        })
      if (path === '/api/v1/teams') return Promise.resolve({ data: [], response: { ok: true } })
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
  }

  it('shows the item\'s assignee in Properties, or Unassigned when none', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    const sidebar = screen.getByTestId('run-item-sidebar')
    expect(within(sidebar).getByText('Unassigned')).toBeInTheDocument()
  })

  it('shows a real assignee when the item has one', async () => {
    mockItemAPI({ ...item, assignee: { kind: 'user', id: 'u-ana', name: 'ana@example.com' } })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    const sidebar = screen.getByTestId('run-item-sidebar')
    expect(within(sidebar).getByText('ana@example.com')).toBeInTheDocument()
  })

  it('a user assignee with a chosen avatar renders through the shared Avatar (add-user-profile)', async () => {
    mockItemAPI({ ...item, assignee: { kind: 'user', id: 'u-ana', name: 'ana@example.com', avatarKey: 'ada-lovelace' } })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    const sidebar = screen.getByTestId('run-item-sidebar')
    const img = within(sidebar).getByRole('img')
    expect(img.getAttribute('src')).toMatch(/ada-lovelace/)
  })

  it('Assign to… opens the dialog and updates the sidebar without a full reload', async () => {
    mockAssignmentAPI()
    mockPUT.mockResolvedValue({ response: { ok: true } })
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.click(screen.getByRole('button', { name: /assign to/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'ana@example.com' }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/status',
        expect.objectContaining({ params: { path: { itemId: 'i1' } }, body: { assigneeUserId: 'u-ana' } }),
      )
    })
    const sidebar = screen.getByTestId('run-item-sidebar')
    expect(await within(sidebar).findByText('ana@example.com')).toBeInTheDocument()
  })
})

describe('screenshot attachments (add-run-item-screenshot-attachments)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  function pngFile(name = 'shot.png') {
    return new File(['fake-png-bytes'], name, { type: 'image/png' })
  }

  function mockUploadOnce(overrides: Record<string, unknown> = {}) {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'att1',
          runItemId: 'i1',
          filename: 'shot.png',
          contentType: 'image/png',
          createdAt: '',
          ...overrides,
        }),
    } as Response)
  }

  it('the Attachments field is independent of Comment: selecting a file there stages it', async () => {
    mockItemAPI()
    mockUploadOnce()
    renderPage()
    await screen.findByLabelText(/comment/i)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, pngFile())

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/items/i1/attachments',
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      )
    })
    expect(await screen.findByRole('button', { name: /open attachment shot\.png/i })).toBeInTheDocument()
    // Comment stayed empty — nothing about attaching required typing anything.
    expect(screen.getByLabelText(/comment/i)).toHaveValue('')
  })

  it('dragging an image onto the Attachments field stages it', async () => {
    mockItemAPI()
    mockUploadOnce()
    renderPage()
    await screen.findByLabelText(/comment/i)

    const zone = screen.getByRole('group', { name: /^attachments$/i })
    fireEvent.drop(zone, { dataTransfer: { files: [pngFile()] } })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: /open attachment shot\.png/i })).toBeInTheDocument()
  })

  it('Comment shows a placeholder mentioning the paste shortcut, only while empty', async () => {
    mockItemAPI()
    renderPage()
    const textarea = (await screen.findByLabelText(/comment/i)) as HTMLTextAreaElement
    expect(textarea.placeholder).toMatch(/screenshots paste here too/i)
  })

  it('pasting an image into Comment also stages it, and confirms it landed in Attachments', async () => {
    mockItemAPI()
    mockUploadOnce()
    renderPage()
    const textarea = await screen.findByLabelText(/comment/i)

    const file = pngFile()
    fireEvent.paste(textarea, {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/items/i1/attachments',
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      )
    })
    expect(await screen.findByRole('button', { name: /open attachment shot\.png/i })).toBeInTheDocument()
    expect(await screen.findByText(/added to attachments/i)).toBeInTheDocument()
    // The image did not get typed into the comment text itself.
    expect(screen.getByLabelText(/comment/i)).toHaveValue('')
  })

  it('dropping an image onto Comment also stages it (same single list as the Attachments field)', async () => {
    mockItemAPI()
    mockUploadOnce()
    renderPage()
    const textarea = await screen.findByLabelText(/comment/i)

    fireEvent.drop(textarea, { dataTransfer: { files: [pngFile()] } })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: /open attachment shot\.png/i })).toBeInTheDocument()
  })

  it('removing a staged attachment deletes it and clears it from the strip', async () => {
    mockItemAPI()
    vi.mocked(fetch).mockImplementation((_url, opts) => {
      if (opts?.method === 'DELETE') return Promise.resolve({ ok: true } as Response)
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ id: 'att1', runItemId: 'i1', filename: 'shot.png', contentType: 'image/png', createdAt: '' }),
      } as Response)
    })
    renderPage()
    await screen.findByLabelText(/comment/i)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, pngFile())
    await screen.findByRole('button', { name: /open attachment shot\.png/i })

    await userEvent.click(screen.getByRole('button', { name: /remove shot\.png/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/v1/attachments/att1', expect.objectContaining({ method: 'DELETE' }))
    })
    expect(screen.queryByRole('button', { name: /open attachment shot\.png/i })).not.toBeInTheDocument()
  })

  it('a rejected file shows a failed tile and adaptive count alongside a later success', async () => {
    mockItemAPI()
    mockUploadOnce()
    renderPage()
    await screen.findByLabelText(/comment/i)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    await userEvent.upload(input, new File(['x'], 'diagram.gif', { type: 'image/gif' }), { applyAccept: false })
    expect(await screen.findByLabelText(/diagram\.gif failed to attach/i)).toBeInTheDocument()

    await userEvent.upload(input, pngFile())
    expect(await screen.findByText(/1 attached, 1 failed/i)).toBeInTheDocument()
  })

  it('rejects an unsupported file type client-side without calling the endpoint', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByLabelText(/comment/i)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    await userEvent.upload(input, file, { applyAccept: false })

    expect(await screen.findByText(/png, jpeg, or webp/i)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects an oversized file client-side without calling the endpoint', async () => {
    mockItemAPI()
    renderPage()
    await screen.findByLabelText(/comment/i)

    const file = pngFile()
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    expect(await screen.findByText(/5 ?MB/i)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('recording a verdict includes staged attachment ids and clears the staged preview', async () => {
    mockItemAPI()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'att1', runItemId: 'i1', filename: 'shot.png', contentType: 'image/png', createdAt: '' }),
    } as Response)
    mockPOST.mockResolvedValue({
      data: { id: 'res1', runItemId: 'i1', actor: 'ana', verdict: 'pass', comment: '', createdAt: '' },
      response: { ok: true },
    })
    renderPage()
    const textarea = await screen.findByLabelText(/comment/i)
    fireEvent.paste(textarea, {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => pngFile() }] },
    })
    await screen.findByRole('button', { name: /open attachment shot\.png/i })

    await userEvent.click(screen.getByRole('button', { name: /^pass$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/items/{itemId}/results',
        expect.objectContaining({
          params: { path: { itemId: 'i1' } },
          body: { verdict: 'pass', comment: '', attachmentIds: ['att1'] },
        }),
      )
    })
  })

  it('a History entry with attachments shows a thumbnail strip', async () => {
    mockItemAPI(undefined, undefined, [
      {
        id: 'res1',
        runItemId: 'i1',
        actor: 'ana',
        actorKind: 'unknown',
        verdict: 'failed',
        comment: '',
        createdAt: '2026-08-05T00:00:00Z',
        attachments: [{ id: 'att1', runItemId: 'i1', resultId: 'res1', filename: 'shot.png', contentType: 'image/png', createdAt: '' }],
      },
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    expect(await screen.findByRole('button', { name: /open attachment shot\.png/i })).toBeInTheDocument()
  })

  it('clicking a History entry\'s paperclip attaches a screenshot to that result', async () => {
    mockItemAPI(undefined, undefined, [
      { id: 'res1', runItemId: 'i1', actor: 'ana', actorKind: 'unknown', verdict: 'failed', comment: '', createdAt: '' },
    ])
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'att1', runItemId: 'i1', resultId: 'res1', filename: 'shot.png', contentType: 'image/png', createdAt: '' }),
    } as Response)
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    await userEvent.click(screen.getByRole('button', { name: /attach screenshot/i }))
    const input = document.querySelectorAll('input[type="file"]')[1] as HTMLInputElement
    await userEvent.upload(input, pngFile())

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/results/res1/attachments',
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      )
    })
    expect(await screen.findByRole('button', { name: /open attachment shot\.png/i })).toBeInTheDocument()
  })

  it('does not show the attach-screenshot affordance on a closed run', async () => {
    mockItemAPI(undefined, { id: 'r1', key: 'r1', projectId: 'p1', projectKey: 'p1', name: 'Sprint 1', status: 'closed', createdAt: '' }, [
      { id: 'res1', runItemId: 'i1', actor: 'ana', actorKind: 'unknown', verdict: 'failed', comment: '', createdAt: '' },
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'Login works' })

    expect(screen.queryByRole('button', { name: /attach screenshot/i })).not.toBeInTheDocument()
  })
})
