import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ReleaseDetailPage from './ReleaseDetailPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

let navigatedTo: string | undefined
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => (to: string) => {
      navigatedTo = to
    },
  }
})

const project = { id: 'p1', key: 'SHOP', name: 'Shop' }
const release = {
  id: 'r1',
  key: 'SHOP-REL1',
  projectId: 'p1',
  name: '2026.1',
  description: 'First GA',
  status: 'active',
  createdAt: '2026-01-12T00:00:00Z',
}

function mockDetailAPI(
  plans: unknown[] = [],
  rollup: unknown = { runCount: 14, passRate: 84 },
  coverage: unknown[] = [],
) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: project, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: { read: true, manageProject: true }, response: { ok: true } })
    if (path === '/api/v1/releases/{releaseKey}') return Promise.resolve({ data: release, response: { ok: true } })
    if (path === '/api/v1/releases/{releaseKey}/plans') return Promise.resolve({ data: plans, response: { ok: true } })
    if (path === '/api/v1/releases/{releaseKey}/rollup') return Promise.resolve({ data: rollup, response: { ok: true } })
    if (path === '/api/v1/releases/{releaseKey}/requirements-coverage')
      return Promise.resolve({ data: coverage, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
}

beforeEach(() => {
  navigatedTo = undefined
  mockGET.mockReset()
  mockPOST.mockReset()
  mockPUT.mockReset()
  mockDELETE.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/SHOP/releases/SHOP-REL1']}>
      <Routes>
        <Route path="/projects/:projectKey/releases/:releaseKey" element={<ReleaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ReleaseDetailPage', () => {
  it('shows the release, its properties, and its test plans', async () => {
    mockDetailAPI([
      { id: 't1', key: 'SHOP-PLAN1', projectId: 'p1', releaseId: 'r1', releaseKey: 'SHOP-REL1', name: 'iOS', description: '', createdAt: '2026-01-14T00:00:00Z' },
    ])
    renderPage()

    expect(await screen.findByRole('heading', { name: '2026.1' })).toBeInTheDocument()
    expect(screen.getByText('iOS')).toBeInTheDocument()
    expect(screen.getByText('SHOP-PLAN1')).toBeInTheDocument()
    expect(screen.getByText('SHOP-REL1')).toBeInTheDocument()
  })

  it('creates a test plan scoped to this release', async () => {
    mockDetailAPI([])
    mockPOST.mockResolvedValue({
      data: { id: 't1', key: 'SHOP-PLAN1', projectId: 'p1', releaseId: 'r1', releaseKey: 'SHOP-REL1', name: 'iOS', description: '', createdAt: '2026-01-14T00:00:00Z' },
      response: { ok: true },
    })
    renderPage()
    await screen.findByRole('heading', { name: '2026.1' })

    await userEvent.click(screen.getAllByRole('button', { name: /new test plan/i })[0])
    await userEvent.type(screen.getByLabelText(/name/i), 'iOS')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() =>
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/releases/{releaseKey}/plans',
        expect.objectContaining({ body: expect.objectContaining({ name: 'iOS' }) }),
      ),
    )
  })

  it('disables delete while the release still has test plans', async () => {
    mockDetailAPI([
      { id: 't1', key: 'SHOP-PLAN1', projectId: 'p1', releaseId: 'r1', releaseKey: 'SHOP-REL1', name: 'iOS', description: '', createdAt: '2026-01-14T00:00:00Z' },
    ])
    renderPage()
    await screen.findByRole('heading', { name: '2026.1' })

    expect(screen.getByRole('button', { name: /delete release/i })).toBeDisabled()
  })

  it('deletes an empty release and navigates to the releases list', async () => {
    mockDetailAPI([])
    mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
    renderPage()
    await screen.findByRole('heading', { name: '2026.1' })

    const deleteButton = screen.getByRole('button', { name: /delete release/i })
    expect(deleteButton).not.toBeDisabled()
    await userEvent.click(deleteButton)
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDELETE).toHaveBeenCalledWith('/api/v1/releases/{releaseKey}', expect.anything()))
    expect(navigatedTo).toBe('/projects/SHOP/releases')
  })

  it('edits the release name, description, and status', async () => {
    mockDetailAPI([])
    mockPUT.mockResolvedValue({ data: undefined, response: { ok: true } })
    renderPage()
    await screen.findByRole('heading', { name: '2026.1' })

    await userEvent.click(screen.getAllByRole('button', { name: /^edit/i })[0])
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'maintained')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/releases/{releaseKey}',
        expect.objectContaining({ body: expect.objectContaining({ status: 'maintained' }) }),
      ),
    )
  })

  describe('Requirements Coverage section (add-requirements-traceability)', () => {
    it('shows an empty state when the project has no requirements', async () => {
      mockDetailAPI([], { runCount: 0, passRate: null }, [])
      renderPage()

      await screen.findByRole('heading', { name: '2026.1' })
      expect(screen.getByText(/no requirements in this project yet/i)).toBeInTheDocument()
    })

    it('renders each requirement with its status pill and linked-case count, linking to its detail page', async () => {
      mockDetailAPI([], { runCount: 0, passRate: null }, [
        { requirementId: 'r1', requirementKey: 'SHOP-REQ1', name: 'Guest checkout', status: 'covered', caseCount: 2 },
        { requirementId: 'r2', requirementKey: 'SHOP-REQ2', name: 'Saved-card checkout', status: 'failing', caseCount: 1 },
        { requirementId: 'r3', requirementKey: 'SHOP-REQ3', name: 'Refunds', status: 'notRun', caseCount: 0 },
      ])
      renderPage()

      const coveredLink = await screen.findByRole('link', { name: 'Guest checkout' })
      expect(coveredLink).toHaveAttribute('href', '/projects/SHOP/requirements/SHOP-REQ1')
      expect(screen.getByText('Covered')).toBeInTheDocument()
      expect(screen.getByText('Failing')).toBeInTheDocument()
      expect(screen.getByText('Not run')).toBeInTheDocument()
    })
  })
})
