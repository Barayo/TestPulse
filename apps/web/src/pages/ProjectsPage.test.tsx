import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ProjectsPage from './ProjectsPage'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ProjectsPage', () => {
  it('lists existing projects as links', async () => {
    mockGET.mockResolvedValue({
      data: [{ id: 'p1', name: 'QA Platform', archived: false, createdAt: '2026-01-01T00:00:00Z' }],
      response: { ok: true },
    })
    renderPage()
    const link = await screen.findByRole('link', { name: /QA Platform/ })
    expect(link).toHaveAttribute('href', '/projects/p1')
  })

  it('creates a project and refreshes the list', async () => {
    mockGET.mockResolvedValue({ data: [], response: { ok: true } })
    mockPOST.mockResolvedValue({
      data: { id: 'p2', name: 'New Proj', archived: false, createdAt: '' },
      response: { ok: true },
    })
    renderPage()

    await userEvent.type(await screen.findByLabelText(/name/i), 'New Proj')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects',
        expect.objectContaining({ body: { name: 'New Proj' } }),
      )
    })
  })

  it('shows a validation message when submitting without a name', async () => {
    mockGET.mockResolvedValue({ data: [], response: { ok: true } })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /create/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(mockPOST).not.toHaveBeenCalled()
  })

  it('marks archived projects', async () => {
    mockGET.mockResolvedValue({
      data: [{ id: 'p1', name: 'Old Proj', archived: true, createdAt: '' }],
      response: { ok: true },
    })
    renderPage()
    expect(await screen.findByText('(archived)')).toBeInTheDocument()
  })

  it('shows the server error when project creation fails', async () => {
    mockGET.mockResolvedValue({ data: [], response: { ok: true } })
    mockPOST.mockResolvedValue({ error: { error: 'duplicate name' }, response: { ok: false } })
    renderPage()

    await userEvent.type(await screen.findByLabelText(/name/i), 'QA')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(await screen.findByText('duplicate name')).toBeInTheDocument()
  })

  it('falls back to a generic message when the server error has no detail', async () => {
    mockGET.mockResolvedValue({ data: [], response: { ok: true } })
    mockPOST.mockResolvedValue({ error: {}, response: { ok: false } })
    renderPage()

    await userEvent.type(await screen.findByLabelText(/name/i), 'QA')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(await screen.findByText(/failed to create project/i)).toBeInTheDocument()
  })

  it('recovers gracefully when the API is unreachable', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    renderPage()
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument()
  })
})
