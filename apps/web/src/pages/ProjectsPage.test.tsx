import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProjectsPage from './ProjectsPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

function mockProjectsList(projects: unknown[] = []) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects') return Promise.resolve({ data: projects, response: { ok: true } })
    if (path === '/api/v1/runs/{runId}/summary')
      return Promise.resolve({ data: { runId: 'r1', total: 0, counts: {} }, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<div>Project page stub</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ProjectsPage', () => {
  it('shows a Projects breadcrumb with no link (it is the root)', () => {
    mockProjectsList()
    renderPage()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Projects')).toBeInTheDocument()
    expect(within(nav).queryByRole('link')).not.toBeInTheDocument()
  })

  it('lists every project with its stats, separate from the create action', async () => {
    mockProjectsList([{ id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }])
    renderPage()
    expect(await screen.findByText('Banca Móvil')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
  })

  it('navigates into a project when its row is clicked', async () => {
    mockProjectsList([{ id: 'p1', name: 'Banca Móvil', archived: false, createdAt: '' }])
    renderPage()
    await userEvent.click(await screen.findByText('Banca Móvil'))
    expect(await screen.findByText('Project page stub')).toBeInTheDocument()
  })

  it('shows an empty state with its own create CTA when there are no projects', async () => {
    mockProjectsList([])
    renderPage()
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create your first project/i })).toBeInTheDocument()
  })

  it('reveals the create form when "+ New project" is clicked, and creates a project', async () => {
    mockProjectsList([])
    mockPOST.mockResolvedValue({
      data: { id: 'p2', name: 'New Proj', archived: false, createdAt: '' },
      response: { ok: true },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
    await userEvent.type(screen.getByLabelText(/name/i), 'New Proj')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects',
        expect.objectContaining({ body: { name: 'New Proj' } }),
      )
    })
    expect(await screen.findByText('Project page stub')).toBeInTheDocument()
  })

  it('shows a validation message when submitting without a name', async () => {
    mockProjectsList([])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /create your first project/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('shows the server error when project creation fails', async () => {
    mockProjectsList([])
    mockPOST.mockResolvedValue({ error: { error: 'duplicate name' }, response: { ok: false } })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /create your first project/i }))
    await userEvent.type(screen.getByLabelText(/name/i), 'QA')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(await screen.findByText('duplicate name')).toBeInTheDocument()
  })

  it('falls back to a generic message when the server error has no detail', async () => {
    mockProjectsList([])
    mockPOST.mockResolvedValue({ error: {}, response: { ok: false } })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /create your first project/i }))
    await userEvent.type(screen.getByLabelText(/name/i), 'QA')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(await screen.findByText(/failed to create project/i)).toBeInTheDocument()
  })
})
