import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import RequirementDetailPage from './RequirementDetailPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
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
const case1 = {
  id: 'c1',
  key: 'SHOP-1',
  projectId: 'p1',
  folderId: 'root',
  currentVersion: 1,
  content: { title: 'Guest checkout works', steps: [], priority: 'medium' },
  createdAt: '',
}
const case2 = {
  id: 'c2',
  key: 'SHOP-2',
  projectId: 'p1',
  folderId: 'root',
  currentVersion: 1,
  content: { title: 'Saved-card checkout works', steps: [], priority: 'medium' },
  createdAt: '',
}
const folders = [{ id: 'root', key: 'SHOP-F1', projectId: 'p1', name: 'Library', parentFolderId: undefined, createdAt: '' }]

const requirement = {
  id: 'r1',
  key: 'SHOP-REQ1',
  projectId: 'p1',
  name: 'Guest checkout',
  description: 'Users can check out without an account',
  externalRef: 'JIRA-1',
  caseIds: ['c1'],
  createdAt: '2026-01-01T00:00:00Z',
}

function mockRequirementAPI(overrides: { manageProject?: boolean; requirement?: unknown } = {}) {
  const manageProject = overrides.manageProject ?? true
  const req = overrides.requirement ?? requirement
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: project, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: { read: true, manageProject }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/cases')
      return Promise.resolve({ data: { items: [case1, case2], nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/folders')
      return Promise.resolve({ data: { items: folders, nextCursor: null }, response: { ok: true } })
    if (path === '/api/v1/requirements/{requirementKey}') return Promise.resolve({ data: req, response: { ok: true } })
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
    <MemoryRouter initialEntries={['/projects/SHOP/requirements/SHOP-REQ1']}>
      <Routes>
        <Route path="/projects/:projectKey/requirements/:requirementKey" element={<RequirementDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequirementDetailPage', () => {
  it('renders name, properties, and the linked case', async () => {
    mockRequirementAPI()
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Guest checkout' })).toBeInTheDocument()
    expect(screen.getByText('SHOP-REQ1')).toBeInTheDocument()
    expect(screen.getByText('JIRA-1')).toBeInTheDocument()
    expect(screen.getByText('Guest checkout works')).toBeInTheDocument()
  })

  it('hides edit controls without manageProject', async () => {
    mockRequirementAPI({ manageProject: false })
    renderPage()

    await screen.findByRole('heading', { name: 'Guest checkout' })
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit cases/i })).not.toBeInTheDocument()
  })

  it('shows an empty state when no cases are linked', async () => {
    mockRequirementAPI({ requirement: { ...requirement, caseIds: [] } })
    renderPage()

    expect(await screen.findByText('No cases linked yet.')).toBeInTheDocument()
  })

  it('links a new case via the case picker and saves', async () => {
    mockRequirementAPI()
    mockPUT.mockResolvedValue({ data: undefined, response: { ok: true } })
    renderPage()
    await screen.findByRole('heading', { name: 'Guest checkout' })

    await userEvent.click(screen.getByRole('button', { name: /edit cases/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Saved-card checkout works' }))
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/requirements/{requirementKey}/cases/{caseKey}',
        expect.objectContaining({ params: { path: { requirementKey: 'SHOP-REQ1', caseKey: 'SHOP-2' } } }),
      ),
    )
  })

  it('deletes the requirement and navigates back when it has no linked cases', async () => {
    mockRequirementAPI({ requirement: { ...requirement, caseIds: [] } })
    mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
    renderPage()
    await screen.findByText('No cases linked yet.')

    await userEvent.click(screen.getByRole('button', { name: /delete requirement/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(mockDELETE).toHaveBeenCalledWith('/api/v1/requirements/{requirementKey}', expect.anything()))
    expect(navigatedTo).toBe('/projects/SHOP/requirements')
  })

  it('disables delete when the requirement still has linked cases', async () => {
    mockRequirementAPI()
    renderPage()
    await screen.findByRole('heading', { name: 'Guest checkout' })

    expect(screen.getByRole('button', { name: /delete requirement/i })).toBeDisabled()
  })
})
