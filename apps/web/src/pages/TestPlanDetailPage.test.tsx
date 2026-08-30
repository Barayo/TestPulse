import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import TestPlanDetailPage from './TestPlanDetailPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

let navigatedTo: { to: string; opts?: unknown } | undefined
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => (to: string, opts?: unknown) => {
      navigatedTo = { to, opts }
    },
  }
})

const project = { id: 'p1', key: 'SHOP', name: 'Shop' }
const plan = {
  id: 't1',
  key: 'SHOP-PLAN1',
  projectId: 'p1',
  releaseId: 'r1',
  releaseKey: 'SHOP-REL1',
  name: 'iOS',
  description: '',
  createdAt: '2026-01-14T00:00:00Z',
}
const release = { id: 'r1', key: 'SHOP-REL1', projectId: 'p1', name: '2026.1', description: '', status: 'active', createdAt: '2026-01-01T00:00:00Z' }

function mockPlanAPI(runs: unknown[] = [], suites: unknown[] = [], rollup: unknown = { runCount: 0, passRate: null }) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: project, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: { read: true, manageProject: true }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/suites') return Promise.resolve({ data: suites, response: { ok: true } })
    if (path === '/api/v1/plans/{planKey}') return Promise.resolve({ data: plan, response: { ok: true } })
    if (path === '/api/v1/releases/{releaseKey}') return Promise.resolve({ data: release, response: { ok: true } })
    if (path === '/api/v1/plans/{planKey}/runs') return Promise.resolve({ data: runs, response: { ok: true } })
    if (path === '/api/v1/plans/{planKey}/rollup') return Promise.resolve({ data: rollup, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
}

beforeEach(() => {
  navigatedTo = undefined
  mockGET.mockReset()
  mockPUT.mockReset()
  mockDELETE.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/SHOP/releases/SHOP-REL1/plans/SHOP-PLAN1']}>
      <Routes>
        <Route path="/projects/:projectKey/releases/:releaseKey/plans/:planKey" element={<TestPlanDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TestPlanDetailPage', () => {
  it('shows the test plan, its release link, and its scoped runs', async () => {
    mockPlanAPI([
      { id: 'run1', key: 'SHOP-R1', projectId: 'p1', projectKey: 'SHOP', name: 'Regression', status: 'closed', createdAt: '2026-01-15T00:00:00Z', passRate: 88 },
    ])
    renderPage()

    expect(await screen.findByRole('heading', { name: 'iOS' })).toBeInTheDocument()
    expect(screen.getByText('SHOP-PLAN1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '2026.1' })).toHaveAttribute('href', '/projects/SHOP/releases/SHOP-REL1')
    expect(screen.getByText('Regression')).toBeInTheDocument()
  })

  it('deep-links "+ New run" with the test plan pre-selected', async () => {
    mockPlanAPI([])
    renderPage()
    await screen.findByRole('heading', { name: 'iOS' })

    await userEvent.click(screen.getAllByRole('button', { name: /new run/i })[0])

    expect(navigatedTo?.to).toBe('/projects/SHOP/runs/new')
    expect(navigatedTo?.opts).toMatchObject({ state: { seedFromTestPlanKey: 'SHOP-PLAN1', seedName: 'iOS run' } })
  })

  it('disables delete while the plan still has runs', async () => {
    mockPlanAPI([
      { id: 'run1', key: 'SHOP-R1', projectId: 'p1', projectKey: 'SHOP', name: 'Regression', status: 'closed', createdAt: '2026-01-15T00:00:00Z', passRate: 88 },
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'iOS' })

    expect(screen.getByRole('button', { name: /delete test plan/i })).toBeDisabled()
  })

  it('edits the test plan name and description', async () => {
    mockPlanAPI([])
    mockPUT.mockResolvedValue({ data: undefined, response: { ok: true } })
    renderPage()
    await screen.findByRole('heading', { name: 'iOS' })

    await userEvent.click(screen.getAllByRole('button', { name: /^edit/i })[0])
    const nameInput = screen.getByLabelText(/^name$/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'iOS (renamed)')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/plans/{planKey}',
        expect.objectContaining({ body: expect.objectContaining({ name: 'iOS (renamed)' }) }),
      ),
    )
  })

  it('deletes an empty test plan and navigates back to the release', async () => {
    mockPlanAPI([])
    mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
    renderPage()
    await screen.findByRole('heading', { name: 'iOS' })

    const deleteButton = screen.getByRole('button', { name: /delete test plan/i })
    expect(deleteButton).not.toBeDisabled()
    await userEvent.click(deleteButton)
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDELETE).toHaveBeenCalledWith('/api/v1/plans/{planKey}', expect.anything()))
    expect(navigatedTo?.to).toBe('/projects/SHOP/releases/SHOP-REL1')
  })
})
