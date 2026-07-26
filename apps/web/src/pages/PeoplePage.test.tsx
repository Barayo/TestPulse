import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import PeoplePage from './PeoplePage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPATCH = vi.mocked(api.PATCH)
const mockDELETE = vi.mocked(api.DELETE)

const manyMemberIds = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']
const users = [
  { id: 'u1', email: 'me@example.com', isTenantAdmin: true, deactivatedAt: null, createdAt: '' },
  { id: 'u2', email: 'other@example.com', isTenantAdmin: false, deactivatedAt: null, createdAt: '' },
  ...manyMemberIds.map((id, i) => ({
    id,
    email: `member${i + 1}@example.com`,
    isTenantAdmin: false,
    deactivatedAt: null,
    createdAt: '',
  })),
  { id: 'u8', email: 'bob@example.com', isTenantAdmin: false, deactivatedAt: null, createdAt: '' },
]
const teams = [
  { id: 't1', name: 'QA Core', memberIds: manyMemberIds, createdAt: '' },
  { id: 't2', name: 'Mobile Squad', memberIds: [], createdAt: '' },
]

function mockAsTenantAdmin(isTenantAdmin: boolean) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin }, response: { ok: true } })
    }
    if (path === '/api/v1/users') return Promise.resolve({ data: users, response: { ok: true } })
    if (path === '/api/v1/teams') return Promise.resolve({ data: teams, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <PeoplePage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('PeoplePage', () => {
  it('shows a not-authorized message for a non-Tenant-Admin', async () => {
    mockAsTenantAdmin(false)
    renderPage()
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument()
    expect(screen.queryByText('other@example.com')).not.toBeInTheDocument()
  })

  it('shows Teams before Users — the shorter list first, so it never needs scrolling past a long roster', async () => {
    mockAsTenantAdmin(true)
    renderPage()
    await screen.findByText('QA Core')

    const teamsHeading = screen.getByRole('heading', { name: /^teams/i })
    const usersHeading = screen.getByRole('heading', { name: /^users/i })
    expect(teamsHeading.compareDocumentPosition(usersHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  describe('Users', () => {
    it('filters the roster by email via a search box', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()
      await screen.findByText('other@example.com')

      await user.type(screen.getByPlaceholderText(/search by email/i), 'other')
      expect(screen.getByText('other@example.com')).toBeInTheDocument()
      expect(screen.queryByText('member1@example.com')).not.toBeInTheDocument()
    })

    it('shows only a first batch of users, with a button to reveal the rest', async () => {
      const many = Array.from({ length: 13 }, (_, i) => ({
        id: `x${i}`,
        email: `x${String(i).padStart(2, '0')}@example.com`,
        isTenantAdmin: false,
        deactivatedAt: null,
        createdAt: '',
      }))
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') {
          return Promise.resolve({ data: { id: 'x00', email: 'x00@example.com', isTenantAdmin: true }, response: { ok: true } })
        }
        if (path === '/api/v1/users') return Promise.resolve({ data: many, response: { ok: true } })
        if (path === '/api/v1/teams') return Promise.resolve({ data: [], response: { ok: true } })
        return Promise.resolve({ data: [], response: { ok: true } })
      })
      const user = userEvent.setup()
      renderPage()
      await screen.findByText('x00@example.com')

      expect(screen.queryByText('x12@example.com')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /show.*more/i }))
      expect(screen.getByText('x12@example.com')).toBeInTheDocument()
    })

    it('resets to the first batch when the search query changes', async () => {
      // 15 "aaa" matches + 10 "bbb" matches. After revealing a second batch
      // (visible count 20), searching "aaa" narrows to 15 results — if the
      // reveal count didn't reset, all 15 would already fit under 20 and no
      // "show more" button would appear, silently passing either way. Only
      // resetting back to a 10-item batch makes the button reappear.
      const many = [
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `a${i}`,
          email: `aaa-${String(i).padStart(2, '0')}@example.com`,
          isTenantAdmin: false,
          deactivatedAt: null,
          createdAt: '',
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `b${i}`,
          email: `bbb-${String(i).padStart(2, '0')}@example.com`,
          isTenantAdmin: false,
          deactivatedAt: null,
          createdAt: '',
        })),
      ]
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') {
          return Promise.resolve({ data: { id: 'a0', email: 'aaa-00@example.com', isTenantAdmin: true }, response: { ok: true } })
        }
        if (path === '/api/v1/users') return Promise.resolve({ data: many, response: { ok: true } })
        if (path === '/api/v1/teams') return Promise.resolve({ data: [], response: { ok: true } })
        return Promise.resolve({ data: [], response: { ok: true } })
      })
      const user = userEvent.setup()
      renderPage()
      await screen.findByText('aaa-00@example.com')

      await user.click(screen.getByRole('button', { name: /show.*more/i }))
      expect(screen.getByText('bbb-04@example.com')).toBeInTheDocument()

      await user.type(screen.getByPlaceholderText(/search by email/i), 'aaa')
      expect(screen.queryByText('aaa-14@example.com')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /show.*more/i })).toBeInTheDocument()
    })

    it('lists users alphabetically for a Tenant Admin, with role and status', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      await screen.findByText('other@example.com')

      const list = screen.getByRole('list', { name: 'Users' })
      const rows = within(list).getAllByRole('listitem')
      expect(rows[0]).toHaveTextContent('bob@example.com')
      const meRow = rows.find((r) => r.textContent?.includes('me@example.com'))
      expect(within(meRow!).getByText('Tenant Admin')).toBeInTheDocument()
    })

    it('does not show the create-user form until "New user" is clicked', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      await screen.findByText('other@example.com')
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    })

    it('creates a user via the form', async () => {
      mockAsTenantAdmin(true)
      mockPOST.mockResolvedValue({
        data: { id: 'u9', email: 'new@example.com', isTenantAdmin: false, deactivatedAt: null, createdAt: '' },
        response: { ok: true },
      })
      const user = userEvent.setup()
      renderPage()
      await screen.findByText('other@example.com')

      await user.click(screen.getByRole('button', { name: /new user/i }))
      await user.type(screen.getByLabelText(/email/i), 'new@example.com')
      await user.type(screen.getByLabelText(/password/i), 'correcthorse')
      await user.click(screen.getByRole('button', { name: /^create$/i }))

      await waitFor(() =>
        expect(mockPOST).toHaveBeenCalledWith(
          '/api/v1/users',
          expect.objectContaining({ body: { email: 'new@example.com', password: 'correcthorse', isTenantAdmin: false } }),
        ),
      )
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    })

    describe('deactivate', () => {
      it('does not deactivate immediately — opens a confirmation dialog naming the user first', async () => {
        mockAsTenantAdmin(true)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /deactivate other@example.com/i }))
        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent(/other@example.com/i)
        expect(mockPATCH).not.toHaveBeenCalled()
      })

      it('cancelling the dialog does not call the API', async () => {
        mockAsTenantAdmin(true)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /deactivate other@example.com/i }))
        await screen.findByRole('dialog')
        await user.click(screen.getByRole('button', { name: /^cancel$/i }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(mockPATCH).not.toHaveBeenCalled()
      })

      it('confirming the dialog deactivates the user', async () => {
        mockAsTenantAdmin(true)
        mockPATCH.mockResolvedValue({ response: { ok: true } })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /deactivate other@example.com/i }))
        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: /deactivate/i }))

        await waitFor(() =>
          expect(mockPATCH).toHaveBeenCalledWith('/api/v1/users/{userId}', {
            params: { path: { userId: 'u2' } },
            body: { deactivate: true },
          }),
        )
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      it('reactivates a deactivated user with no confirmation needed', async () => {
        mockGET.mockImplementation((path: string) => {
          if (path === '/api/v1/users/me') {
            return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin: true }, response: { ok: true } })
          }
          if (path === '/api/v1/users') {
            return Promise.resolve({
              data: [
                { id: 'u1', email: 'me@example.com', isTenantAdmin: true, deactivatedAt: null, createdAt: '' },
                { id: 'u2', email: 'other@example.com', isTenantAdmin: false, deactivatedAt: '2026-01-01T00:00:00Z', createdAt: '' },
              ],
              response: { ok: true },
            })
          }
          return Promise.resolve({ data: [], response: { ok: true } })
        })
        mockPATCH.mockResolvedValue({ response: { ok: true } })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        expect(screen.queryByRole('button', { name: /^deactivate other@example.com$/i })).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: /reactivate/i }))

        await waitFor(() =>
          expect(mockPATCH).toHaveBeenCalledWith('/api/v1/users/{userId}', {
            params: { path: { userId: 'u2' } },
            body: { reactivate: true },
          }),
        )
      })
    })
  })

  describe('Teams', () => {
    it('lists teams alphabetically with member counts', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      await screen.findByText('QA Core')

      const rows = screen.getAllByRole('button', { expanded: false })
      expect(rows[0]).toHaveTextContent('Mobile Squad')
      expect(rows[1]).toHaveTextContent('QA Core')
      expect(rows[1]).toHaveTextContent('7 members')
    })

    it('does not show the create-team form until "New team" is clicked', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      await screen.findByText('QA Core')
      expect(screen.queryByLabelText(/team name/i)).not.toBeInTheDocument()
    })

    it('creates a team via the form', async () => {
      mockAsTenantAdmin(true)
      mockPOST.mockResolvedValue({ data: { id: 't3', name: 'New Team', memberIds: [], createdAt: '' }, response: { ok: true } })
      const user = userEvent.setup()
      renderPage()
      await screen.findByText('QA Core')

      await user.click(screen.getByRole('button', { name: /new team/i }))
      await user.type(screen.getByLabelText(/team name/i), 'New Team')
      await user.click(screen.getByRole('button', { name: /create team/i }))

      await waitFor(() =>
        expect(mockPOST).toHaveBeenCalledWith('/api/v1/teams', expect.objectContaining({ body: { name: 'New Team' } })),
      )
    })

    it('expands a team in place on click, with no modal involved', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()
      await screen.findByText('QA Core')

      const teamToggle = screen.getByRole('button', { name: /qa core/i })
      await user.click(teamToggle)
      const teamCard = teamToggle.closest('li') as HTMLElement
      expect(within(teamCard).getByText('member1@example.com')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows only a first batch of members, with a button to reveal the rest', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()
      await screen.findByText('QA Core')

      const teamToggle = screen.getByRole('button', { name: /qa core/i })
      await user.click(teamToggle)
      const teamCard = teamToggle.closest('li') as HTMLElement
      expect(within(teamCard).queryByText('member6@example.com')).not.toBeInTheDocument()
      await user.click(within(teamCard).getByRole('button', { name: /show.*more/i }))
      expect(within(teamCard).getByText('member6@example.com')).toBeInTheDocument()
      expect(within(teamCard).getByText('member7@example.com')).toBeInTheDocument()
    })

    it('filters existing members via the always-visible filter box, separate from adding', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()
      await screen.findByText('QA Core')

      const teamToggle = screen.getByRole('button', { name: /qa core/i })
      await user.click(teamToggle)
      const teamCard = teamToggle.closest('li') as HTMLElement
      await user.type(within(teamCard).getByPlaceholderText(/filter members/i), 'member2')

      expect(within(teamCard).getByText('member2@example.com')).toBeInTheDocument()
      expect(within(teamCard).queryByText('member1@example.com')).not.toBeInTheDocument()
      // Filtering existing members must not also surface add-a-member
      // results — the two are now separate controls with separate jobs.
      expect(within(teamCard).queryByPlaceholderText(/search directory/i)).not.toBeInTheDocument()
    })

    it('resets the member-list reveal count when the filter query changes', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      renderPage()
      await screen.findByText('QA Core')

      const teamToggle = screen.getByRole('button', { name: /qa core/i })
      await user.click(teamToggle)
      const teamCard = teamToggle.closest('li') as HTMLElement

      await user.click(within(teamCard).getByRole('button', { name: /show.*more/i }))
      expect(within(teamCard).getByText('member7@example.com')).toBeInTheDocument()

      await user.type(within(teamCard).getByPlaceholderText(/filter members/i), 'member')
      expect(within(teamCard).getByRole('button', { name: /show.*more/i })).toBeInTheDocument()
    })

    describe('add member', () => {
      it('does not show the directory search until "+ Add member" is clicked', async () => {
        mockAsTenantAdmin(true)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('Mobile Squad')

        const teamToggle = screen.getByRole('button', { name: /mobile squad/i })
        await user.click(teamToggle)
        const teamCard = teamToggle.closest('li') as HTMLElement
        expect(within(teamCard).queryByPlaceholderText(/search directory/i)).not.toBeInTheDocument()
      })

      it('adds a member via the directory search, not a modal', async () => {
        mockAsTenantAdmin(true)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('Mobile Squad')

        const teamToggle = screen.getByRole('button', { name: /mobile squad/i })
        await user.click(teamToggle)
        const teamCard = teamToggle.closest('li') as HTMLElement
        await user.click(within(teamCard).getByRole('button', { name: /add member/i }))
        await user.type(within(teamCard).getByPlaceholderText(/search directory/i), 'bob')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

        await user.click(await within(teamCard).findByText('bob@example.com'))
        await waitFor(() =>
          expect(mockPOST).toHaveBeenCalledWith('/api/v1/teams/{teamId}/members/{userId}', {
            params: { path: { teamId: 't2', userId: 'u8' } },
          }),
        )
      })

      it('caps directory results and hints at how many more match, rather than dumping a huge list', async () => {
        const manyCandidates = Array.from({ length: 12 }, (_, i) => ({
          id: `c${i}`,
          email: `cand-${String(i).padStart(2, '0')}@example.com`,
          isTenantAdmin: false,
          deactivatedAt: null,
          createdAt: '',
        }))
        mockGET.mockImplementation((path: string) => {
          if (path === '/api/v1/users/me') {
            return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin: true }, response: { ok: true } })
          }
          if (path === '/api/v1/users') return Promise.resolve({ data: manyCandidates, response: { ok: true } })
          if (path === '/api/v1/teams') return Promise.resolve({ data: [{ id: 't2', name: 'Mobile Squad', memberIds: [], createdAt: '' }], response: { ok: true } })
          return Promise.resolve({ data: [], response: { ok: true } })
        })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('Mobile Squad')

        const teamToggle = screen.getByRole('button', { name: /mobile squad/i })
        await user.click(teamToggle)
        const teamCard = teamToggle.closest('li') as HTMLElement
        await user.click(within(teamCard).getByRole('button', { name: /add member/i }))
        await user.type(within(teamCard).getByPlaceholderText(/search directory/i), 'cand')

        expect(within(teamCard).getByText('cand-00@example.com')).toBeInTheDocument()
        expect(within(teamCard).queryByText('cand-11@example.com')).not.toBeInTheDocument()
        expect(within(teamCard).getByText(/4 more/i)).toBeInTheDocument()
      })
    })

    describe('remove member', () => {
      it('does not remove immediately — opens a confirmation dialog naming the member first', async () => {
        mockAsTenantAdmin(true)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('QA Core')

        await user.click(screen.getByRole('button', { name: /qa core/i }))
        await user.click(await screen.findByRole('button', { name: /remove member1@example.com/i }))

        const dialog = await screen.findByRole('dialog', { name: /remove/i })
        expect(dialog).toHaveTextContent(/member1@example.com/i)
        expect(mockDELETE).not.toHaveBeenCalled()
      })

      it('confirming the dialog removes the member', async () => {
        mockAsTenantAdmin(true)
        mockDELETE.mockResolvedValue({ response: { ok: true } })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('QA Core')

        await user.click(screen.getByRole('button', { name: /qa core/i }))
        await user.click(await screen.findByRole('button', { name: /remove member1@example.com/i }))
        const dialog = await screen.findByRole('dialog', { name: /remove/i })
        await user.click(within(dialog).getByRole('button', { name: /^remove$/i }))

        await waitFor(() =>
          expect(mockDELETE).toHaveBeenCalledWith('/api/v1/teams/{teamId}/members/{userId}', {
            params: { path: { teamId: 't1', userId: 'm1' } },
          }),
        )
      })
    })
  })
})
