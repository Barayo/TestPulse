import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import RequirementsPage from './RequirementsPage'
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

function mockRequirementsAPI(requirements: unknown[], manageProject = true) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}') return Promise.resolve({ data: project, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/permissions')
      return Promise.resolve({ data: { read: true, manageProject }, response: { ok: true } })
    if (path === '/api/v1/projects/{projectKey}/requirements')
      return Promise.resolve({ data: requirements, response: { ok: true } })
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
    <MemoryRouter initialEntries={['/projects/SHOP/requirements']}>
      <Routes>
        <Route path="/projects/:projectKey/requirements" element={<RequirementsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequirementsPage', () => {
  it('lists requirements with their linked case count', async () => {
    mockRequirementsAPI([
      {
        id: 'r1',
        key: 'SHOP-REQ1',
        projectId: 'p1',
        name: 'Guest checkout',
        description: 'Users can check out without an account',
        externalRef: '',
        caseIds: ['c1', 'c2'],
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    renderPage()

    expect(await screen.findByText('Guest checkout')).toBeInTheDocument()
    expect(screen.getByText('SHOP-REQ1')).toBeInTheDocument()
    expect(screen.getByText(/2 cases linked/)).toBeInTheDocument()
  })

  it('shows an empty state with a create action when there are no requirements', async () => {
    mockRequirementsAPI([])
    renderPage()

    expect(await screen.findByText('No requirements yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /new requirement/i }).length).toBeGreaterThan(0)
  })

  it('hides create controls without manageProject', async () => {
    mockRequirementsAPI([], false)
    renderPage()

    await screen.findByText('No requirements yet')
    expect(screen.queryByRole('button', { name: /new requirement/i })).not.toBeInTheDocument()
  })

  it('creates a requirement and navigates to it', async () => {
    mockRequirementsAPI([])
    mockPOST.mockResolvedValue({
      data: {
        id: 'r1',
        key: 'SHOP-REQ1',
        projectId: 'p1',
        name: 'Guest checkout',
        description: '',
        externalRef: '',
        caseIds: [],
        createdAt: '2026-01-01T00:00:00Z',
      },
      response: { ok: true },
    })
    renderPage()
    await screen.findByText('No requirements yet')

    await userEvent.click(screen.getAllByRole('button', { name: /new requirement/i })[0])
    await userEvent.type(screen.getByLabelText(/name/i), 'Guest checkout')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() =>
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/requirements',
        expect.objectContaining({ body: expect.objectContaining({ name: 'Guest checkout' }) }),
      ),
    )
    expect(navigatedTo).toBe('/projects/SHOP/requirements/SHOP-REQ1')
  })
})
