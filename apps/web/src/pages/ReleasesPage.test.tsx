import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ReleasesPage from './ReleasesPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

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

function mockReleasesAPI(releases: unknown[], rollups: Record<string, unknown> = {}, plans: Record<string, unknown[]> = {}) {
  mockGET.mockImplementation((path: string, opts?: { params?: { path?: Record<string, string> } }) => {
    if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: project, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: { read: true, manageProject: true }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/releases') return Promise.resolve({ data: releases, response: { ok: true } })
    if (path === '/api/v1/releases/{releaseKey}/rollup') {
      const key = opts?.params?.path?.releaseKey ?? ''
      return Promise.resolve({ data: rollups[key] ?? { runCount: 0, passRate: null }, response: { ok: true } })
    }
    if (path === '/api/v1/releases/{releaseKey}/plans') {
      const key = opts?.params?.path?.releaseKey ?? ''
      return Promise.resolve({ data: plans[key] ?? [], response: { ok: true } })
    }
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
}

beforeEach(() => {
  navigatedTo = undefined
  mockGET.mockReset()
  mockPOST.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/SHOP/releases']}>
      <Routes>
        <Route path="/projects/:projectKey/releases" element={<ReleasesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ReleasesPage', () => {
  it('lists releases with their rollup and test plan count', async () => {
    mockReleasesAPI(
      [{ id: 'r1', key: 'SHOP-REL1', projectId: 'p1', name: '2026.1', description: '', status: 'active', createdAt: '2026-01-01T00:00:00Z' }],
      { 'SHOP-REL1': { runCount: 14, passRate: 84 } },
      { 'SHOP-REL1': [{ id: 't1' }, { id: 't2' }] },
    )
    renderPage()

    expect(await screen.findByText('2026.1')).toBeInTheDocument()
    expect(screen.getByText('SHOP-REL1')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/2 test plans/)).toBeInTheDocument()
  })

  it('shows an empty state with a create action when there are no releases', async () => {
    mockReleasesAPI([])
    renderPage()

    expect(await screen.findByText('No releases yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /new release/i }).length).toBeGreaterThan(0)
  })

  it('creates a release and navigates to it', async () => {
    mockReleasesAPI([])
    mockPOST.mockResolvedValue({
      data: { id: 'r1', key: 'SHOP-REL1', projectId: 'p1', name: '2026.2', description: '', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
      response: { ok: true },
    })
    renderPage()
    await screen.findByText('No releases yet')

    await userEvent.click(screen.getAllByRole('button', { name: /new release/i })[0])
    await userEvent.type(screen.getByLabelText(/name/i), '2026.2')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(mockPOST).toHaveBeenCalledWith(
      '/api/v1/projects/{projectKey}/releases',
      expect.objectContaining({ body: expect.objectContaining({ name: '2026.2' }) }),
    ))
    expect(navigatedTo).toBe('/projects/SHOP/releases/SHOP-REL1')
  })
})
