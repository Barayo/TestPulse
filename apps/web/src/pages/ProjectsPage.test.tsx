import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProjectsPage from './ProjectsPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockDELETE = vi.mocked(api.DELETE)

const ME_ADMIN = { id: 'admin1', email: 'admin@example.com', role: 'admin' }
const ME_MEMBER = { id: 'member1', email: 'member@example.com', role: 'member' }

function project(overrides: Record<string, unknown> = {}) {
  return { id: 'p1', name: 'Banca Móvil', archived: false, description: '', ownerId: null, createdAt: '', ...overrides }
}

function summary(overrides: Record<string, unknown> = {}) {
  return { projectId: 'p1', suiteCount: 0, caseCount: 0, passRate: null, isFavorite: false, ...overrides }
}

function mockProjectsList(
  projects: unknown[] = [],
  summaries: unknown[] = [],
  opts: { me?: unknown; users?: unknown[] } = {},
) {
  const me = opts.me ?? ME_ADMIN
  const users = opts.users ?? []
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects') return Promise.resolve({ data: projects, response: { ok: true } })
    if (path === '/api/v1/projects/summaries')
      return Promise.resolve({ data: summaries, response: { ok: true } })
    if (path === '/api/v1/users/me') return Promise.resolve({ data: me, response: { ok: true } })
    if (path === '/api/v1/users') return Promise.resolve({ data: users, response: { ok: true } })
    if (path === '/api/v1/runs/{runId}/summary')
      return Promise.resolve({ data: { runId: 'r1', total: 0, counts: {} }, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<div>Project page stub</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function manyProjects(count: number) {
  return Array.from({ length: count }, (_, i) => project({ id: `p${i}`, name: `Project ${i}` }))
}

function manySummaries(count: number, favIndex?: number) {
  return Array.from({ length: count }, (_, i) =>
    summary({ projectId: `p${i}`, passRate: 90, isFavorite: i === favIndex }),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
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
    mockProjectsList([project()])
    renderPage()
    expect(await screen.findByText('Banca Móvil')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
  })

  it('shows suite/case counts as stat tiles and a status pill in expanded view', async () => {
    mockProjectsList([project()], [summary({ suiteCount: 7, caseCount: 70, passRate: 84 })])
    renderPage()
    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(screen.getByText(/suites/i)).toBeInTheDocument()
    expect(screen.getByText('70')).toBeInTheDocument()
    expect(screen.getByText(/cases/i)).toBeInTheDocument()
    expect(screen.getByText('Healthy', { selector: 'span' })).toBeInTheDocument()
  })

  it('renders the project name clearly, not in the heavy page-title weight', async () => {
    mockProjectsList([project()])
    renderPage()
    const title = await screen.findByText('Banca Móvil')
    expect(title).toHaveClass('font-semibold')
    expect(title).not.toHaveClass('font-black')
  })

  it('shows when the project was created, in expanded view', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    mockProjectsList([project({ createdAt: threeDaysAgo })], [summary()])
    renderPage()
    expect(await screen.findByText(/created 3 days ago/i)).toBeInTheDocument()
  })

  it('shows when the project was last run, in expanded view', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    mockProjectsList([project()], [summary({ passRate: 84, lastRunAt: twoHoursAgo })])
    renderPage()
    expect(await screen.findByText(/last run 2 hours ago/i)).toBeInTheDocument()
  })

  it('omits the last-run line when the project has no runs yet', async () => {
    mockProjectsList([project()], [summary({ passRate: null, lastRunAt: null })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.queryByText(/last run/i)).not.toBeInTheDocument()
  })

  it('shows "No runs yet" instead of a pass rate when a project has no runs', async () => {
    mockProjectsList([project({ name: 'Desktop App' })], [summary({ caseCount: 20, passRate: null })])
    renderPage()
    expect(await screen.findByText('No runs yet', { selector: 'span' })).toBeInTheDocument()
  })

  it('navigates into a project when its row is clicked', async () => {
    mockProjectsList([project()])
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
      data: { id: 'p2', name: 'New Proj', archived: false, description: '', ownerId: null, createdAt: '' },
      response: { ok: true },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
    await userEvent.type(screen.getByLabelText(/^name$/i), 'New Proj')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects',
        expect.objectContaining({ body: expect.objectContaining({ name: 'New Proj' }) }),
      )
    })
    expect(await screen.findByText('Project page stub')).toBeInTheDocument()
  })

  it('creates a project with an optional description and owner', async () => {
    mockProjectsList([], [], { users: [{ id: 'u1', email: 'owner@example.com', role: 'member' }] })
    mockPOST.mockResolvedValue({
      data: { id: 'p2', name: 'Full Proj', archived: false, description: 'desc', ownerId: 'u1', createdAt: '' },
      response: { ok: true },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Full Proj')
    await userEvent.type(screen.getByLabelText(/description/i), 'desc')
    await userEvent.selectOptions(await screen.findByLabelText(/owner/i), 'u1')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects',
        expect.objectContaining({ body: { name: 'Full Proj', description: 'desc', ownerId: 'u1' } }),
      )
    })
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
    await userEvent.type(screen.getByLabelText(/^name$/i), 'QA')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(await screen.findByText('duplicate name')).toBeInTheDocument()
  })

  it('falls back to a generic message when the server error has no detail', async () => {
    mockProjectsList([])
    mockPOST.mockResolvedValue({ error: {}, response: { ok: false } })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /create your first project/i }))
    await userEvent.type(screen.getByLabelText(/^name$/i), 'QA')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(await screen.findByText(/failed to create project/i)).toBeInTheDocument()
  })

  it('shows description and owner on the card when present', async () => {
    mockProjectsList(
      [project({ description: 'A dense banking project', ownerId: 'u1' })],
      [summary()],
      { users: [{ id: 'u1', email: 'owner@example.com', role: 'member' }] },
    )
    renderPage()
    expect(await screen.findByText('A dense banking project')).toBeInTheDocument()
    expect(await screen.findByText(/owner@example.com/)).toBeInTheDocument()
  })

  describe('status labels', () => {
    it('shows "Healthy" at or above 80% pass rate', async () => {
      mockProjectsList([project()], [summary({ passRate: 84 })])
      renderPage()
      expect(await screen.findByText('Healthy', { selector: 'span' })).toBeInTheDocument()
    })

    it('shows "In progress" between 50% and 79%', async () => {
      mockProjectsList([project()], [summary({ passRate: 60 })])
      renderPage()
      expect(await screen.findByText('In progress', { selector: 'span' })).toBeInTheDocument()
    })

    it('shows "At risk" below 50%', async () => {
      mockProjectsList([project()], [summary({ passRate: 30 })])
      renderPage()
      expect(await screen.findByText('At risk', { selector: 'span' })).toBeInTheDocument()
    })
  })

  describe('density-adaptive view mode', () => {
    it('defaults to the expanded view for 10 or fewer projects on desktop', async () => {
      mockProjectsList(manyProjects(10), manySummaries(10))
      renderPage()
      await screen.findByText('Project 0')
      expect(screen.getByRole('button', { name: /expanded view/i })).toHaveAttribute('aria-pressed', 'true')
    })

    it('defaults to the compact view for more than 10 projects on desktop', async () => {
      mockProjectsList(manyProjects(11), manySummaries(11))
      renderPage()
      await screen.findByText('Project 0')
      expect(screen.getByRole('button', { name: /compact view/i })).toHaveAttribute('aria-pressed', 'true')
    })

    it('always renders compact on a mobile viewport and hides the manual toggle', async () => {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
      mockProjectsList(manyProjects(3), manySummaries(3))
      renderPage()
      await screen.findByText('Project 0')
      expect(screen.queryByRole('button', { name: /expanded view/i })).not.toBeInTheDocument()
      expect(screen.getByLabelText(/search projects/i)).toBeInTheDocument()
    })

    it('lets a desktop user manually toggle the view, overriding the automatic choice', async () => {
      mockProjectsList(manyProjects(3), manySummaries(3))
      renderPage()
      await screen.findByText('Project 0')
      expect(screen.getByRole('button', { name: /expanded view/i })).toHaveAttribute('aria-pressed', 'true')

      await userEvent.click(screen.getByRole('button', { name: /compact view/i }))
      expect(screen.getByRole('button', { name: /compact view/i })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText(/search projects/i)).toBeInTheDocument()
    })

    it('persists the manual view choice across a remount', async () => {
      mockProjectsList(manyProjects(3), manySummaries(3))
      const { unmount } = renderPage()
      await screen.findByText('Project 0')
      await userEvent.click(screen.getByRole('button', { name: /compact view/i }))
      unmount()

      renderPage()
      await screen.findByText('Project 0')
      expect(screen.getByRole('button', { name: /compact view/i })).toHaveAttribute('aria-pressed', 'true')
    })

    it('shows a pinned Favorites section in expanded view for starred projects', async () => {
      mockProjectsList(manyProjects(3), manySummaries(3, 1))
      renderPage()
      await screen.findByText('Project 0')
      const favSection = screen.getByRole('region', { name: 'Favorites' })
      expect(within(favSection).getByText('Project 1')).toBeInTheDocument()
    })

    it('shows the pass rate as a number (not a word) in the Favorites mini-card', async () => {
      mockProjectsList(manyProjects(3), manySummaries(3, 1))
      renderPage()
      await screen.findByText('Project 0')
      const favSection = screen.getByRole('region', { name: 'Favorites' })
      expect(within(favSection).getByText('90% · 0 suites')).toBeInTheDocument()
    })

    it('has no Favorites section in compact view', async () => {
      mockProjectsList(manyProjects(11), manySummaries(11, 1))
      renderPage()
      await screen.findByText('Project 0')
      expect(screen.queryByRole('region', { name: 'Favorites' })).not.toBeInTheDocument()
    })

    it('compact view shows the status pill, bar, and counts — but no description, owner, or created date', async () => {
      window.localStorage.setItem('testpulse.projectListViewMode', 'compact')
      mockProjectsList(
        [project({ description: 'A dense banking project', ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z' })],
        [summary({ suiteCount: 7, caseCount: 70, passRate: 84 })],
        { users: [{ id: 'u1', email: 'owner@example.com', role: 'member' }] },
      )
      renderPage()
      await screen.findByText('Banca Móvil')

      expect(screen.getByText('Healthy', { selector: 'span' })).toBeInTheDocument()
      expect(document.querySelector('[data-track]')).toBeInTheDocument()
      expect(screen.getByText('7 suites · 70 cases')).toBeInTheDocument()
      expect(screen.queryByText('A dense banking project')).not.toBeInTheDocument()
      expect(screen.queryByText(/owner@example.com/)).not.toBeInTheDocument()
      expect(screen.queryByText(/created/i)).not.toBeInTheDocument()
    })
  })

  describe('favorites', () => {
    it('stars a project from its card and refetches', async () => {
      mockProjectsList([project()], [summary({ isFavorite: false })])
      mockPOST.mockResolvedValue({ data: undefined, response: { ok: true } })
      renderPage()
      await screen.findByText('Banca Móvil')

      await userEvent.click(screen.getByRole('button', { name: /star banca móvil/i }))
      await waitFor(() => {
        expect(mockPOST).toHaveBeenCalledWith(
          '/api/v1/projects/{projectId}/favorite',
          expect.objectContaining({ params: { path: { projectId: 'p1' } } }),
        )
      })
    })

    it('unstars an already-favorited project from its card', async () => {
      mockProjectsList([project()], [summary({ isFavorite: true })])
      mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
      renderPage()
      await screen.findByText('Banca Móvil')

      await userEvent.click(screen.getByRole('button', { name: /unstar banca móvil/i }))
      await waitFor(() => {
        expect(mockDELETE).toHaveBeenCalledWith(
          '/api/v1/projects/{projectId}/favorite',
          expect.objectContaining({ params: { path: { projectId: 'p1' } } }),
        )
      })
    })
  })

  describe('search and status filter', () => {
    it('filters the list by name via the search input', async () => {
      mockProjectsList(manyProjects(11), manySummaries(11))
      renderPage()
      await screen.findByText('Project 0')

      await userEvent.type(screen.getByLabelText(/search projects/i), 'Project 3')
      expect(screen.getByText('Project 3')).toBeInTheDocument()
      expect(screen.queryByText('Project 0')).not.toBeInTheDocument()
    })

    it('filters the list by status via the filter chips', async () => {
      const projects = manyProjects(11)
      const summaries = manyProjects(11).map((p, i) => summary({ projectId: p.id, passRate: i === 3 ? 20 : 90 }))
      mockProjectsList(projects, summaries)
      renderPage()
      await screen.findByText('Project 0')

      await userEvent.click(screen.getByRole('button', { name: 'At risk' }))
      expect(screen.getByText('Project 3')).toBeInTheDocument()
      expect(screen.queryByText('Project 0')).not.toBeInTheDocument()
    })

    it('is also available in expanded view, and filters there too', async () => {
      mockProjectsList(manyProjects(3), manySummaries(3))
      renderPage()
      await screen.findByText('Project 0')
      expect(screen.getByRole('button', { name: /expanded view/i })).toHaveAttribute('aria-pressed', 'true')

      await userEvent.type(screen.getByLabelText(/search projects/i), 'Project 1')
      expect(screen.getByText('Project 1')).toBeInTheDocument()
      expect(screen.queryByText('Project 0')).not.toBeInTheDocument()
    })
  })

  describe('single-project skip (design D6)', () => {
    it('navigates a non-admin directly into their only visible project', async () => {
      mockProjectsList([project()], [summary()], { me: ME_MEMBER })
      renderPage()
      expect(await screen.findByText('Project page stub')).toBeInTheDocument()
    })

    it('still shows the list to an admin with only one project', async () => {
      mockProjectsList([project()], [summary()], { me: ME_ADMIN })
      renderPage()
      expect(await screen.findByText('Banca Móvil')).toBeInTheDocument()
    })

    it('shows the list to a non-admin with multiple projects', async () => {
      mockProjectsList(manyProjects(2), manySummaries(2), { me: ME_MEMBER })
      renderPage()
      expect(await screen.findByText('Project 0')).toBeInTheDocument()
      expect(screen.getByText('Project 1')).toBeInTheDocument()
    })

    it('shows the empty state to a non-admin with zero projects', async () => {
      mockProjectsList([], [], { me: ME_MEMBER })
      renderPage()
      expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument()
    })
  })
})
