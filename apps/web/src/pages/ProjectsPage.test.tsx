import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ProjectsPage from './ProjectsPage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

const ME_TENANT_ADMIN = { id: 'admin1', email: 'admin@example.com', isTenantAdmin: true }
const ME_NON_ADMIN = { id: 'member1', email: 'member@example.com', isTenantAdmin: false }

function project(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string | undefined) ?? 'p1'
  return {
    id,
    key: id,
    name: 'Banca Móvil',
    archived: false,
    description: '',
    isSample: false,
    createdAt: '',
    ...overrides,
  }
}

function summary(overrides: Record<string, unknown> = {}) {
  return { projectId: 'p1', suiteCount: 0, caseCount: 0, passRate: null, isFavorite: false, ...overrides }
}

function mockProjectsList(projects: unknown[] = [], summaries: unknown[] = [], opts: { me?: unknown } = {}) {
  const me = opts.me ?? ME_TENANT_ADMIN
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects') return Promise.resolve({ data: projects, response: { ok: true } })
    if (path === '/api/v1/projects/summaries')
      return Promise.resolve({ data: summaries, response: { ok: true } })
    if (path === '/api/v1/users/me') return Promise.resolve({ data: me, response: { ok: true } })
    if (path === '/api/v1/runs/{runKey}/summary')
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
          <Route path="/projects/:projectKey" element={<div>Project page stub</div>} />
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
  it('shows no breadcrumb at the root — a single "Projects" segment would only repeat the heading below it', async () => {
    mockProjectsList()
    renderPage()
    await screen.findByRole('heading', { name: 'Projects' })
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
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
    expect(screen.getByText(/suites/i, { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('70')).toBeInTheDocument()
    expect(screen.getByText(/cases/i, { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Healthy', { selector: 'span' })).toBeInTheDocument()
  })

  it('shows a "Sample" badge next to the sample project in expanded view', async () => {
    mockProjectsList([project({ isSample: true })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.getByText('Sample')).toBeInTheDocument()
  })

  it('shows no badge for a non-sample project in expanded view', async () => {
    mockProjectsList([project({ isSample: false })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.queryByText('Sample')).not.toBeInTheDocument()
  })

  it('shows a "Sample" badge next to the sample project in compact view', async () => {
    window.localStorage.setItem('testpulse.projectListViewMode', 'compact')
    mockProjectsList([project({ isSample: true })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.getByText('Sample')).toBeInTheDocument()
  })

  // add-data-retention design.md D5: same slot/order as the Sample badge.
  it('shows an "Archived" badge next to an archived project in expanded view', async () => {
    mockProjectsList([project({ archived: true })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('shows no "Archived" badge for an active project in expanded view', async () => {
    mockProjectsList([project({ archived: false })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.queryByText('Archived')).not.toBeInTheDocument()
  })

  // add-project-tags: tag chips on the card.
  it('shows tag chips on an expanded card', async () => {
    mockProjectsList([project()], [summary({ tags: ['mobile', 'internal'] })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.getByText('mobile')).toBeInTheDocument()
    expect(screen.getByText('internal')).toBeInTheDocument()
  })

  it('shows no tag chips for an untagged project in expanded view', async () => {
    mockProjectsList([project()], [summary({ tags: [] })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.queryByText('mobile')).not.toBeInTheDocument()
  })

  it('caps expanded-card tag chips at 4 with a "+N" overflow chip', async () => {
    mockProjectsList([project()], [summary({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('d')).toBeInTheDocument()
    expect(screen.queryByText('e')).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('shows tag chips on a compact card', async () => {
    window.localStorage.setItem('testpulse.projectListViewMode', 'compact')
    mockProjectsList([project()], [summary({ tags: ['mobile'] })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.getByText('mobile')).toBeInTheDocument()
  })

  it('shows an "Archived" badge next to an archived project in compact view', async () => {
    window.localStorage.setItem('testpulse.projectListViewMode', 'compact')
    mockProjectsList([project({ archived: true })])
    renderPage()
    await screen.findByText('Banca Móvil')
    expect(screen.getByText('Archived')).toBeInTheDocument()
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

  it('reveals the create form when "+ New project" → "Start from scratch" is chosen, and creates a project', async () => {
    mockProjectsList([])
    mockPOST.mockResolvedValue({
      data: { id: 'p2', key: 'p2', name: 'New Proj', archived: false, description: '', createdAt: '' },
      response: { ok: true },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /start from scratch/i }))
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

  it('stages tags in the create form and assigns them after creation (add-project-tags)', async () => {
    mockProjectsList([])
    mockPOST.mockResolvedValue({
      data: { id: 'p2', key: 'p2', name: 'Tagged Proj', archived: false, description: '', createdAt: '' },
      response: { ok: true },
    })
    mockPUT.mockResolvedValue({ data: undefined, response: { ok: true } })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /start from scratch/i }))
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Tagged Proj')
    await userEvent.type(screen.getByPlaceholderText(/add a tag/i), 'mobile{Enter}')
    expect(screen.getByText('mobile')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockPUT).toHaveBeenCalledWith(
        '/api/v1/projects/{projectKey}/tags/{tagName}',
        expect.objectContaining({ params: { path: { projectKey: 'p2', tagName: 'mobile' } } }),
      )
    })
    expect(await screen.findByText('Project page stub')).toBeInTheDocument()
  })

  it('creates a project with an optional description', async () => {
    mockProjectsList([])
    mockPOST.mockResolvedValue({
      data: { id: 'p2', key: 'p2', name: 'Full Proj', archived: false, description: 'desc', createdAt: '' },
      response: { ok: true },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /start from scratch/i }))
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Full Proj')
    await userEvent.type(screen.getByLabelText(/description/i), 'desc')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockPOST).toHaveBeenCalledWith(
        '/api/v1/projects',
        expect.objectContaining({ body: { name: 'Full Proj', description: 'desc' } }),
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

  it('shows description on the card when present', async () => {
    mockProjectsList([project({ description: 'A dense banking project' })], [summary()])
    renderPage()
    expect(await screen.findByText('A dense banking project')).toBeInTheDocument()
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

    it('compact view shows the status pill, bar, and counts — but no description or created date', async () => {
      window.localStorage.setItem('testpulse.projectListViewMode', 'compact')
      mockProjectsList(
        [project({ description: 'A dense banking project', createdAt: '2026-01-01T00:00:00Z' })],
        [summary({ suiteCount: 7, caseCount: 70, passRate: 84 })],
      )
      renderPage()
      await screen.findByText('Banca Móvil')

      expect(screen.getByText('Healthy', { selector: 'span' })).toBeInTheDocument()
      expect(document.querySelector('[data-track]')).toBeInTheDocument()
      expect(screen.getByText('7 suites · 70 cases')).toBeInTheDocument()
      expect(screen.queryByText('A dense banking project')).not.toBeInTheDocument()
      expect(screen.queryByText(/created \d/i)).not.toBeInTheDocument()
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
          '/api/v1/projects/{projectKey}/favorite',
          expect.objectContaining({ params: { path: { projectKey: 'p1' } } }),
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
          '/api/v1/projects/{projectKey}/favorite',
          expect.objectContaining({ params: { path: { projectKey: 'p1' } } }),
        )
      })
    })
  })

  describe('inline tag editing (add-project-tags)', () => {
    it('adds a new tag to a project from its card', async () => {
      mockProjectsList([project()], [summary({ tags: [] })])
      mockPUT.mockResolvedValue({ data: undefined, response: { ok: true } })
      renderPage()
      await screen.findByText('Banca Móvil')

      await userEvent.click(screen.getByRole('button', { name: /edit tags for banca móvil/i }))
      await userEvent.type(screen.getByPlaceholderText(/add a tag/i), 'mobile{Enter}')

      await waitFor(() => {
        expect(mockPUT).toHaveBeenCalledWith(
          '/api/v1/projects/{projectKey}/tags/{tagName}',
          expect.objectContaining({ params: { path: { projectKey: 'p1', tagName: 'mobile' } } }),
        )
      })
    })

    it('removes a tag from a project via the inline editor', async () => {
      mockProjectsList([project()], [summary({ tags: ['mobile'] })])
      mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
      renderPage()
      await screen.findByText('Banca Móvil')

      await userEvent.click(screen.getByRole('button', { name: /edit tags for banca móvil/i }))
      await userEvent.click(screen.getByRole('button', { name: /remove mobile/i }))

      await waitFor(() => {
        expect(mockDELETE).toHaveBeenCalledWith(
          '/api/v1/projects/{projectKey}/tags/{tagName}',
          expect.objectContaining({ params: { path: { projectKey: 'p1', tagName: 'mobile' } } }),
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

  describe('tag filter (add-project-tags)', () => {
    it('does not render a tag filter control when no project has any tags', async () => {
      mockProjectsList([project()], [summary({ tags: [] })])
      renderPage()
      await screen.findByText('Banca Móvil')
      expect(screen.queryByRole('button', { name: /^tag$/i })).not.toBeInTheDocument()
    })

    it('renders a tag filter control when at least one project has a tag', async () => {
      mockProjectsList([project()], [summary({ tags: ['mobile'] })])
      renderPage()
      await screen.findByText('Banca Móvil')
      expect(screen.getByRole('button', { name: /^tag$/i })).toBeInTheDocument()
    })

    it('filters the list by tag via the tag filter popover', async () => {
      const projects = [project({ id: 'p1' }), project({ id: 'p2', name: 'Second' })]
      const summaries = [
        summary({ projectId: 'p1', tags: ['mobile'] }),
        summary({ projectId: 'p2', tags: ['backend'] }),
      ]
      mockProjectsList(projects, summaries)
      renderPage()
      await screen.findByText('Banca Móvil')

      await userEvent.click(screen.getByRole('button', { name: /^tag$/i }))
      await userEvent.click(within(screen.getByRole('dialog', { name: /filter by tag/i })).getByRole('button', { name: /mobile/i }))

      expect(screen.getByText('Banca Móvil')).toBeInTheDocument()
      expect(screen.queryByText('Second')).not.toBeInTheDocument()
    })

    it('composes the tag filter with the status filter', async () => {
      const projects = [project({ id: 'p1' }), project({ id: 'p2', name: 'Second' })]
      const summaries = [
        summary({ projectId: 'p1', tags: ['mobile'], passRate: 90 }),
        summary({ projectId: 'p2', tags: ['mobile'], passRate: 20 }),
      ]
      mockProjectsList(projects, summaries)
      renderPage()
      await screen.findByText('Banca Móvil')

      await userEvent.click(screen.getByRole('button', { name: /^tag$/i }))
      await userEvent.click(within(screen.getByRole('dialog', { name: /filter by tag/i })).getByRole('button', { name: /mobile/i }))
      await userEvent.click(screen.getByRole('button', { name: 'At risk' }))

      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.queryByText('Banca Móvil')).not.toBeInTheDocument()
    })

    it('clears the active tag filter', async () => {
      const projects = [project({ id: 'p1' }), project({ id: 'p2', name: 'Second' })]
      const summaries = [
        summary({ projectId: 'p1', tags: ['mobile'] }),
        summary({ projectId: 'p2', tags: ['backend'] }),
      ]
      mockProjectsList(projects, summaries)
      renderPage()
      await screen.findByText('Banca Móvil')

      await userEvent.click(screen.getByRole('button', { name: /^tag$/i }))
      await userEvent.click(within(screen.getByRole('dialog', { name: /filter by tag/i })).getByRole('button', { name: /mobile/i }))
      expect(screen.queryByText('Second')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /clear tag filter/i }))
      expect(screen.getByText('Second')).toBeInTheDocument()
    })
  })

  it('never wraps a multi-word filter pill label onto multiple lines', async () => {
    mockProjectsList(manyProjects(11), manySummaries(11))
    renderPage()
    await screen.findByText('Project 0')
    expect(screen.getByRole('button', { name: 'No runs yet' })).toHaveClass('whitespace-nowrap')
  })

  describe('sorting', () => {
    it('defaults to sorting by name ascending', async () => {
      const projects = [
        project({ id: 'p1', name: 'Charlie' }),
        project({ id: 'p2', name: 'Alpha' }),
        project({ id: 'p3', name: 'Bravo' }),
      ]
      mockProjectsList(projects, projects.map((p) => summary({ projectId: p.id })))
      renderPage()
      await screen.findByText('Alpha')
      const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
      expect(titles).toEqual(['Alpha', 'Bravo', 'Charlie'])
    })

    it('defaults a numeric key to most-first when first selected', async () => {
      const projects = manyProjects(3)
      const summaries = [
        summary({ projectId: 'p0', suiteCount: 2 }),
        summary({ projectId: 'p1', suiteCount: 20 }),
        summary({ projectId: 'p2', suiteCount: 8 }),
      ]
      mockProjectsList(projects, summaries)
      renderPage()
      await screen.findByText('Project 0')

      await userEvent.selectOptions(screen.getByLabelText(/sort by/i), 'suites')
      const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
      expect(titles).toEqual(['Project 1', 'Project 2', 'Project 0'])
    })

    it('toggles direction for the current sort key', async () => {
      const projects = [
        project({ id: 'p1', name: 'Charlie' }),
        project({ id: 'p2', name: 'Alpha' }),
        project({ id: 'p3', name: 'Bravo' }),
      ]
      mockProjectsList(projects, projects.map((p) => summary({ projectId: p.id })))
      renderPage()
      await screen.findByText('Alpha')

      await userEvent.click(screen.getByRole('button', { name: /toggle sort direction/i }))
      const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
      expect(titles).toEqual(['Charlie', 'Bravo', 'Alpha'])
    })

    it('applies the same sort within Favorites and the main list', async () => {
      const projects = [project({ id: 'p1', name: 'Charlie' }), project({ id: 'p2', name: 'Alpha' })]
      const summaries = [
        summary({ projectId: 'p1', isFavorite: true }),
        summary({ projectId: 'p2', isFavorite: true }),
      ]
      mockProjectsList(projects, summaries)
      renderPage()
      await screen.findByText('Alpha')

      const favSection = screen.getByRole('region', { name: 'Favorites' })
      const before = favSection.textContent ?? ''
      expect(before.indexOf('Alpha')).toBeLessThan(before.indexOf('Charlie'))

      await userEvent.click(screen.getByRole('button', { name: /toggle sort direction/i }))
      const after = screen.getByRole('region', { name: 'Favorites' }).textContent ?? ''
      expect(after.indexOf('Charlie')).toBeLessThan(after.indexOf('Alpha'))
    })

    it('keeps the sort control visible on mobile, unlike the view-mode toggle', async () => {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
      mockProjectsList(manyProjects(3), manySummaries(3))
      renderPage()
      await screen.findByText('Project 0')
      expect(screen.queryByRole('button', { name: /expanded view/i })).not.toBeInTheDocument()
      expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument()
    })

    it('persists the sort choice across a remount', async () => {
      mockProjectsList(manyProjects(3), manySummaries(3))
      const { unmount } = renderPage()
      await screen.findByText('Project 0')
      await userEvent.selectOptions(screen.getByLabelText(/sort by/i), 'created')
      unmount()

      renderPage()
      await screen.findByText('Project 0')
      expect(screen.getByLabelText(/sort by/i)).toHaveValue('created')
    })
  })

  describe('single-project skip (design D6)', () => {
    it('navigates a non-admin directly into their only visible project', async () => {
      mockProjectsList([project()], [summary()], { me: ME_NON_ADMIN })
      renderPage()
      expect(await screen.findByText('Project page stub')).toBeInTheDocument()
    })

    it('still shows the list to an admin with only one project', async () => {
      mockProjectsList([project()], [summary()], { me: ME_TENANT_ADMIN })
      renderPage()
      expect(await screen.findByText('Banca Móvil')).toBeInTheDocument()
    })

    it('shows the list to a non-admin with multiple projects', async () => {
      mockProjectsList(manyProjects(2), manySummaries(2), { me: ME_NON_ADMIN })
      renderPage()
      expect(await screen.findByText('Project 0')).toBeInTheDocument()
      expect(screen.getByText('Project 1')).toBeInTheDocument()
    })

    it('shows a no-access empty state to a non-admin with zero projects, without a create CTA', async () => {
      mockProjectsList([], [], { me: ME_NON_ADMIN })
      renderPage()
      expect(await screen.findByText(/don't have access to any projects/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /create your first project/i })).not.toBeInTheDocument()
    })

    it('shows the create-project empty state to a Tenant Admin with zero projects', async () => {
      mockProjectsList([], [], { me: ME_TENANT_ADMIN })
      renderPage()
      expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create your first project/i })).toBeInTheDocument()
    })
  })

  describe('project creation gated to Tenant Admin (add-project-rbac)', () => {
    it('hides "+ New project" for a non-Tenant-Admin', async () => {
      mockProjectsList(manyProjects(2), manySummaries(2), { me: ME_NON_ADMIN })
      renderPage()
      await screen.findByText('Project 0')
      expect(screen.queryByRole('button', { name: /\+ new project/i })).not.toBeInTheDocument()
    })

    it('shows "+ New project" for a Tenant Admin', async () => {
      mockProjectsList(manyProjects(2), manySummaries(2), { me: ME_TENANT_ADMIN })
      renderPage()
      await screen.findByText('Project 0')
      expect(screen.getByRole('button', { name: /\+ new project/i })).toBeInTheDocument()
    })
  })

  // add-testrail-importer tasks.md 7.1: "+ New project" opens a small
  // anchored menu (reusing CardTagEditor/HiddenSegmentsMenu's click-outside/
  // Escape pattern) offering a data-driven list of project sources, instead
  // of jumping straight to the inline create form.
  describe('new project entry-point menu (add-testrail-importer)', () => {
    it('is closed by default — no menu items until the trigger is clicked', async () => {
      mockProjectsList([])
      renderPage()
      await screen.findByRole('button', { name: /^\+ new project$/i })
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('opens a menu with "Start from scratch" and "Import from TestRail", each with a description', async () => {
      mockProjectsList([])
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))

      const menu = screen.getByRole('menu', { name: /new project/i })
      const scratch = within(menu).getByRole('menuitem', { name: /start from scratch/i })
      const testrail = within(menu).getByRole('menuitem', { name: /import from testrail/i })
      expect(scratch).toBeInTheDocument()
      expect(testrail).toBeInTheDocument()
      expect(within(scratch).getByText(/create an empty project/i)).toBeInTheDocument()
      expect(within(testrail).getByText(/bring in suites, sections, and cases/i)).toBeInTheDocument()
    })

    it('navigates to /projects/import/testrail when "Import from TestRail" is chosen', async () => {
      mockProjectsList([])
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/projects/import/:source" element={<div>Import page stub</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      )
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /import from testrail/i }))
      expect(await screen.findByText('Import page stub')).toBeInTheDocument()
    })

    // add-qase-importer tasks.md 3.1: the same data-driven source list
    // gains a second connector entry — one more array item, not a new
    // branch of menu markup.
    it('also offers "Import from Qase" alongside Start from scratch/TestRail', async () => {
      mockProjectsList([])
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))

      const menu = screen.getByRole('menu', { name: /new project/i })
      const qase = within(menu).getByRole('menuitem', { name: /import from qase/i })
      expect(qase).toBeInTheDocument()
    })

    it('navigates to /projects/import/qase when "Import from Qase" is chosen', async () => {
      mockProjectsList([])
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/projects/import/:source" element={<div>Import page stub</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      )
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /import from qase/i }))
      expect(await screen.findByText('Import page stub')).toBeInTheDocument()
    })

    // add-csv-import-export tasks.md 6.1: a 4th source, no vendor account
    // needed (Pepe's mock: a distinct upload icon from TestRail/Qase's
    // DatabaseIcon signals this before the user even reads the description).
    it('also offers "Import from CSV" alongside the other sources', async () => {
      mockProjectsList([])
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))

      const menu = screen.getByRole('menu', { name: /new project/i })
      const csv = within(menu).getByRole('menuitem', { name: /import from csv/i })
      expect(csv).toBeInTheDocument()
    })

    it('navigates to /projects/import/csv when "Import from CSV" is chosen', async () => {
      mockProjectsList([])
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/projects/import/:source" element={<div>Import page stub</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      )
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /import from csv/i }))
      expect(await screen.findByText('Import page stub')).toBeInTheDocument()
    })

    // add-zephyr-scale-importer tasks.md 4.1: a 4th connector entry, same
    // data-driven source list.
    it('also offers "Import from Zephyr Scale" alongside the other sources', async () => {
      mockProjectsList([])
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))

      const menu = screen.getByRole('menu', { name: /new project/i })
      const zephyrScale = within(menu).getByRole('menuitem', { name: /import from zephyr scale/i })
      expect(zephyrScale).toBeInTheDocument()
    })

    it('navigates to /projects/import/zephyr-scale when "Import from Zephyr Scale" is chosen', async () => {
      mockProjectsList([])
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/projects/import/:source" element={<div>Import page stub</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      )
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /import from zephyr scale/i }))
      expect(await screen.findByText('Import page stub')).toBeInTheDocument()
    })

    // add-kiwi-tcms-importer tasks.md 4.1: a 5th connector entry, same
    // data-driven source list.
    it('also offers "Import from Kiwi TCMS" alongside the other sources', async () => {
      mockProjectsList([])
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))

      const menu = screen.getByRole('menu', { name: /new project/i })
      const kiwiTCMS = within(menu).getByRole('menuitem', { name: /import from kiwi tcms/i })
      expect(kiwiTCMS).toBeInTheDocument()
    })

    it('navigates to /projects/import/kiwi-tcms when "Import from Kiwi TCMS" is chosen', async () => {
      mockProjectsList([])
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/projects/import/:source" element={<div>Import page stub</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      )
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /import from kiwi tcms/i }))
      expect(await screen.findByText('Import page stub')).toBeInTheDocument()
    })

    // add-xray-importer tasks.md 5.1: a 6th connector entry, same
    // data-driven source list.
    it('also offers "Import from Xray" alongside the other sources', async () => {
      mockProjectsList([])
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))

      const menu = screen.getByRole('menu', { name: /new project/i })
      const xray = within(menu).getByRole('menuitem', { name: /import from xray/i })
      expect(xray).toBeInTheDocument()
    })

    it('navigates to /projects/import/xray when "Import from Xray" is chosen', async () => {
      mockProjectsList([])
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/projects/import/:source" element={<div>Import page stub</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      )
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /import from xray/i }))
      expect(await screen.findByText('Import page stub')).toBeInTheDocument()
    })

    // add-tuskr-importer tasks.md 4.1: a 7th connector entry, same
    // data-driven source list.
    it('also offers "Import from Tuskr" alongside the other sources', async () => {
      mockProjectsList([])
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))

      const menu = screen.getByRole('menu', { name: /new project/i })
      const tuskr = within(menu).getByRole('menuitem', { name: /import from tuskr/i })
      expect(tuskr).toBeInTheDocument()
    })

    it('navigates to /projects/import/tuskr when "Import from Tuskr" is chosen', async () => {
      mockProjectsList([])
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/projects/import/:source" element={<div>Import page stub</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      )
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: /import from tuskr/i }))
      expect(await screen.findByText('Import page stub')).toBeInTheDocument()
    })

    it('closes the menu on Escape without navigating or opening the create form', async () => {
      mockProjectsList([])
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
      expect(screen.getByRole('menu')).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument()
    })

    it('closes the menu on an outside click', async () => {
      mockProjectsList([project()])
      renderPage()
      await screen.findByText('Banca Móvil')
      await userEvent.click(await screen.findByRole('button', { name: /^\+ new project$/i }))
      expect(screen.getByRole('menu')).toBeInTheDocument()
      await userEvent.click(document.body)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })
})

function publicProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    key: 'SP',
    name: 'Sample Project',
    archived: false,
    description: '',
    isSample: false,
    createdAt: '',
    ...overrides,
  }
}

// anonymous discovery branch, ported from the now-retired
// PublicProjectsIndexPage/usePublicProjects (unify-authenticated-and-public-views
// tasks.md group 11, design.md D6).
function mockAnonymousProjectsList(publicProjects: unknown[] | undefined) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') return Promise.resolve({ data: undefined, response: { ok: false } })
    if (path === '/api/v1/public/projects')
      return publicProjects === undefined
        ? new Promise(() => {}) // never resolves — simulates still-loading
        : Promise.resolve({ data: publicProjects, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

describe('anonymous / dual-mode', () => {
  it('renders nothing extra in the body while the public-projects fetch is still in flight', async () => {
    mockAnonymousProjectsList(undefined)
    renderPage()
    await screen.findByRole('heading', { name: 'Projects' })
    expect(screen.queryByText(/no public projects/i)).not.toBeInTheDocument()
  })

  it('fires no request while the session check is still in flight', async () => {
    mockGET.mockImplementation((path: string) => {
      if (path === '/api/v1/users/me') return new Promise(() => {}) // never resolves
      return Promise.resolve({ data: undefined, response: { ok: true } })
    })
    renderPage()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/public/projects', expect.anything())
  })

  // Matches the established empty-state pattern (dashed border + icon,
  // e.g. CaseStepsList.tsx's "No steps yet") — Pepe design review
  // (issue #199): this page had skipped the app's own existing convention,
  // not needed a new one. No action button: an anonymous visitor has
  // nothing that would fix an empty public-projects list.
  it('shows a dashed-border empty state with an icon, not an error, when no project is public', async () => {
    mockAnonymousProjectsList([])
    renderPage()
    expect(await screen.findByText('No public projects yet')).toBeInTheDocument()
    expect(screen.getByText(/doesn't have any projects open to visitors right now/i)).toBeInTheDocument()
    const container = screen.getByText('No public projects yet').closest('div')
    expect(container).toHaveClass('border-dashed')
    expect(container?.querySelector('svg')).not.toBeNull()
  })

  it('renders a card per project — name, description, Sample badge — when multiple are public', async () => {
    mockAnonymousProjectsList([
      publicProject({ id: 'p1', key: 'SP', name: 'Sample Project', description: 'the showroom', isSample: true }),
      publicProject({ id: 'p2', key: 'QA', name: 'QA Platform', description: 'real work' }),
    ])
    renderPage()
    expect(await screen.findByText('Sample Project')).toBeInTheDocument()
    expect(screen.getByText('the showroom')).toBeInTheDocument()
    expect(screen.getByText('Sample')).toBeInTheDocument()
    expect(screen.getByText('QA Platform')).toBeInTheDocument()
    expect(screen.getByText('real work')).toBeInTheDocument()
  })

  it('links each card to the unified project route, not the old /public/{key} shape', async () => {
    mockAnonymousProjectsList([
      publicProject({ id: 'p1', key: 'SP', name: 'Sample Project' }),
      publicProject({ id: 'p2', key: 'QA', name: 'QA Platform' }),
    ])
    renderPage()
    const link = await screen.findByRole('link', { name: /sample project/i })
    expect(link).toHaveAttribute('href', '/projects/SP')
  })

  it('redirects straight to the single public project without ever showing the grid', async () => {
    mockAnonymousProjectsList([publicProject({ id: 'p1', key: 'SP', name: 'Sample Project' })])
    renderPage()
    await screen.findByText('Project page stub')
    expect(screen.queryByText('Sample Project')).not.toBeInTheDocument()
  })
})
