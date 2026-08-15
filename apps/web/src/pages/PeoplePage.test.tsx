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
  { id: 'u2', email: 'other@example.com', isTenantAdmin: false, avatarKey: 'ada-lovelace', deactivatedAt: null, createdAt: '' },
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

// Same as mockAsTenantAdmin, but with an explicit passwordResetEnabled on
// GET /api/v1/meta (add-change-own-password) — the Edit-user dialog's
// password actions branch on this.
function mockAsTenantAdminWithMeta(passwordResetEnabled: boolean) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') {
      return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin: true }, response: { ok: true } })
    }
    if (path === '/api/v1/users') return Promise.resolve({ data: users, response: { ok: true } })
    if (path === '/api/v1/teams') return Promise.resolve({ data: teams, response: { ok: true } })
    if (path === '/api/v1/meta') return Promise.resolve({ data: { passwordResetEnabled }, response: { ok: true } })
    return Promise.resolve({ data: [], response: { ok: true } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

// Matches the team-row expand toggle by its visible name, without also
// matching the row's "Delete {team name}" button — both contain the team
// name as a substring, so a plain name regex is ambiguous between them.
function teamToggleName(text: string) {
  const re = new RegExp(text, 'i')
  return (name: string) => re.test(name) && !/^delete /i.test(name)
}

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
    it('renders a user row through the shared Avatar, showing a chosen preset image (add-user-profile)', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      const row = (await screen.findByText('other@example.com')).closest('li') as HTMLElement
      const img = within(row).getByRole('img')
      expect(img.getAttribute('src')).toMatch(/ada-lovelace/)
    })

    it('the Deactivate button on an active row is visible without hovering/focusing (redesign-admin-shell)', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      const row = (await screen.findByText('other@example.com')).closest('li') as HTMLElement
      const deactivateBtn = within(row).getByRole('button', { name: /deactivate other@example.com/i })
      expect(deactivateBtn.className).not.toMatch(/opacity-0/)
      expect(deactivateBtn).toHaveAttribute('title', 'Deactivate other@example.com')
    })

    it('shows the display name (bold) with the email demoted below it, when they differ', async () => {
      mockGET.mockImplementation((path: string) => {
        if (path === '/api/v1/users/me') {
          return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin: true }, response: { ok: true } })
        }
        if (path === '/api/v1/users') {
          return Promise.resolve({
            data: [{ id: 'u2', email: 'other@example.com', displayName: 'Other Person', isTenantAdmin: false, deactivatedAt: null, createdAt: '' }],
            response: { ok: true },
          })
        }
        return Promise.resolve({ data: [], response: { ok: true } })
      })
      renderPage()
      expect(await screen.findByText('Other Person')).toBeInTheDocument()
      expect(screen.getByText('other@example.com')).toBeInTheDocument()
    })

    it('shows just the email when there is no display name', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      const matches = await screen.findAllByText('other@example.com')
      expect(matches).toHaveLength(1)
    })

    it('shows "Tenant Admin" as a pill and "Member" as plain text', async () => {
      mockAsTenantAdmin(true)
      renderPage()
      const adminRow = (await screen.findByText('me@example.com')).closest('li') as HTMLElement
      const memberRow = (await screen.findByText('other@example.com')).closest('li') as HTMLElement
      expect(within(adminRow).getByText('Tenant Admin').className).toMatch(/rounded-full/)
      expect(within(memberRow).getByText('Member').className).not.toMatch(/rounded-full/)
    })

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

    it('offers a Generate action for the new user\'s password, with reveal + copy', async () => {
      mockAsTenantAdmin(true)
      const user = userEvent.setup()
      const writeText = vi.fn().mockResolvedValue(undefined)
      renderPage()
      await screen.findByText('other@example.com')
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

      await user.click(screen.getByRole('button', { name: /new user/i }))
      await user.click(screen.getByRole('button', { name: /^generate$/i }))

      const passwordField = screen.getByLabelText(/password/i) as HTMLInputElement
      expect(passwordField.value).toHaveLength(20)
      await user.click(screen.getByRole('button', { name: /^copy$/i }))
      expect(writeText).toHaveBeenCalledWith(passwordField.value)
    })

    describe('edit (add-update-user)', () => {
      it('shows an Edit icon action on an active row', async () => {
        mockAsTenantAdmin(true)
        renderPage()
        await screen.findByText('other@example.com')

        expect(screen.getByRole('button', { name: /^edit other@example.com$/i })).toBeInTheDocument()
      })

      it('shows an Edit text link alongside Reactivate/Delete on a deactivated row', async () => {
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
        renderPage()
        await screen.findByText('other@example.com')

        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^reactivate$/i })).toBeInTheDocument()
      })

      it('opens a dialog pre-filled with the current email', async () => {
        mockAsTenantAdmin(true)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByLabelText(/^email$/i)).toHaveValue('other@example.com')
        expect(mockPATCH).not.toHaveBeenCalled()
      })

      it('submitting an email-only change sends only the email field', async () => {
        mockAsTenantAdmin(true)
        mockPATCH.mockResolvedValue({ response: { ok: true } })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
        const dialog = await screen.findByRole('dialog')
        const emailField = within(dialog).getByLabelText(/^email$/i)
        await user.clear(emailField)
        await user.type(emailField, 'fixed@example.com')
        await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() =>
          expect(mockPATCH).toHaveBeenCalledWith('/api/v1/users/{userId}', {
            params: { path: { userId: 'u2' } },
            body: { email: 'fixed@example.com' },
          }),
        )
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      it('rejects an invalid email inline without calling the API', async () => {
        mockAsTenantAdmin(true)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
        const dialog = await screen.findByRole('dialog')
        const emailField = within(dialog).getByLabelText(/^email$/i)
        await user.clear(emailField)
        await user.type(emailField, 'not-an-email')
        await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

        expect(await within(dialog).findByText(/enter a valid email/i)).toBeInTheDocument()
        expect(mockPATCH).not.toHaveBeenCalled()
      })

      it('surfaces a server error inline, e.g. a duplicate email', async () => {
        mockAsTenantAdmin(true)
        mockPATCH.mockResolvedValue({ error: { error: 'email already in use' } })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
        const dialog = await screen.findByRole('dialog')
        const emailField = within(dialog).getByLabelText(/^email$/i)
        await user.clear(emailField)
        await user.type(emailField, 'taken@example.com')
        await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

        expect(await within(dialog).findByText(/email already in use/i)).toBeInTheDocument()
      })

      it('cancelling the dialog does not call the API', async () => {
        mockAsTenantAdmin(true)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
        await screen.findByRole('dialog')
        await user.click(screen.getByRole('button', { name: /^cancel$/i }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(mockPATCH).not.toHaveBeenCalled()
      })

      describe('password actions (add-change-own-password)', () => {
        it('never shows a free-text password field, in either SMTP state', async () => {
          mockAsTenantAdminWithMeta(true)
          const user = userEvent.setup()
          renderPage()
          await screen.findByText('other@example.com')

          await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
          const dialog = await screen.findByRole('dialog')
          expect(within(dialog).queryByLabelText(/^new password$/i)).not.toBeInTheDocument()
        })

        it('with SMTP configured: sends a reset email immediately, with an inline confirmation', async () => {
          mockAsTenantAdminWithMeta(true)
          mockPOST.mockResolvedValue({ data: undefined, error: undefined, response: { ok: true, status: 204 } as Response })
          const user = userEvent.setup()
          renderPage()
          await screen.findByText('other@example.com')

          await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
          const dialog = await screen.findByRole('dialog')
          await user.click(within(dialog).getByRole('button', { name: /send password reset email/i }))

          expect(mockPOST).toHaveBeenCalledWith(
            '/api/v1/users/{userId}/password-reset-email',
            expect.objectContaining({ params: { path: { userId: 'u2' } } }),
          )
          expect(await within(dialog).findByText(/reset email sent to other@example\.com/i)).toBeInTheDocument()
        })

        it('with SMTP configured: shows a "require a password change at next login" checkbox, saved with the rest of the form', async () => {
          mockAsTenantAdminWithMeta(true)
          mockPATCH.mockResolvedValue({ response: { ok: true } })
          const user = userEvent.setup()
          renderPage()
          await screen.findByText('other@example.com')

          await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
          const dialog = await screen.findByRole('dialog')
          await user.click(within(dialog).getByRole('checkbox', { name: /require a password change/i }))
          await user.click(within(dialog).getByRole('button', { name: /^save$/i }))

          await waitFor(() =>
            expect(mockPATCH).toHaveBeenCalledWith('/api/v1/users/{userId}', {
              params: { path: { userId: 'u2' } },
              body: { requirePasswordChange: true },
            }),
          )
        })

        it('without SMTP configured: offers Generate a temporary password instead of the reset-email action', async () => {
          mockAsTenantAdminWithMeta(false)
          const user = userEvent.setup()
          renderPage()
          await screen.findByText('other@example.com')

          await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
          const dialog = await screen.findByRole('dialog')
          expect(within(dialog).queryByRole('button', { name: /send password reset email/i })).not.toBeInTheDocument()
          expect(within(dialog).getByRole('button', { name: /generate a temporary password/i })).toBeInTheDocument()
        })

        it('without SMTP configured: generating reveals the chip and warns about the forced change', async () => {
          mockAsTenantAdminWithMeta(false)
          mockPOST.mockResolvedValue({ data: { password: 'Gxk7mQ2pRz9nT4wYcVbA' }, error: undefined, response: { ok: true, status: 200 } as Response })
          const user = userEvent.setup()
          renderPage()
          await screen.findByText('other@example.com')

          await user.click(screen.getByRole('button', { name: /^edit other@example.com$/i }))
          const dialog = await screen.findByRole('dialog')
          await user.click(within(dialog).getByRole('button', { name: /generate a temporary password/i }))

          expect(mockPOST).toHaveBeenCalledWith(
            '/api/v1/users/{userId}/generate-temporary-password',
            expect.objectContaining({ params: { path: { userId: 'u2' } } }),
          )
          expect(await within(dialog).findByText('Gxk7mQ2pRz9nT4wYcVbA')).toBeInTheDocument()
          expect(within(dialog).getByText(/signs them out everywhere/i)).toBeInTheDocument()
        })
      })
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

    describe('delete (add-user-deletion)', () => {
      const deactivatedUsers = [
        { id: 'u1', email: 'me@example.com', isTenantAdmin: true, deactivatedAt: '2026-01-01T00:00:00Z', createdAt: '' },
        { id: 'u2', email: 'other@example.com', isTenantAdmin: false, deactivatedAt: '2026-01-01T00:00:00Z', createdAt: '' },
      ]

      function mockDeactivated() {
        mockGET.mockImplementation((path: string) => {
          if (path === '/api/v1/users/me') {
            return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin: true }, response: { ok: true } })
          }
          if (path === '/api/v1/users') return Promise.resolve({ data: deactivatedUsers, response: { ok: true } })
          if (path === '/api/v1/users/{userId}/deletion-preview') {
            return Promise.resolve({ data: { teamCount: 2, projectCount: 1, tokenCount: 3 }, response: { ok: true } })
          }
          return Promise.resolve({ data: [], response: { ok: true } })
        })
      }

      it('shows a Delete action on a deactivated user\'s row, but not for the signed-in admin\'s own row', async () => {
        mockDeactivated()
        renderPage()
        await screen.findByText('other@example.com')

        expect(screen.getByRole('button', { name: /^delete other@example.com$/i })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^delete me@example.com$/i })).not.toBeInTheDocument()
      })

      it('opens a confirmation dialog naming the account, disables confirm until real counts load', async () => {
        let resolvePreview: (v: { data: { teamCount: number; projectCount: number; tokenCount: number } }) => void
        const previewPromise = new Promise<{ data: { teamCount: number; projectCount: number; tokenCount: number } }>(
          (resolve) => {
            resolvePreview = resolve
          },
        )
        mockGET.mockImplementation((path: string) => {
          if (path === '/api/v1/users/me') {
            return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin: true }, response: { ok: true } })
          }
          if (path === '/api/v1/users') return Promise.resolve({ data: deactivatedUsers, response: { ok: true } })
          if (path === '/api/v1/users/{userId}/deletion-preview') return previewPromise as Promise<never>
          return Promise.resolve({ data: [], response: { ok: true } })
        })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /^delete other@example.com$/i }))
        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent(/other@example.com/i)

        const confirmBtn = within(dialog).getByRole('button', { name: /^delete$/i })
        expect(confirmBtn).toBeDisabled()
        expect(mockGET).toHaveBeenCalledWith(
          '/api/v1/users/{userId}/deletion-preview',
          expect.objectContaining({ params: { path: { userId: 'u2' } } }),
        )

        resolvePreview!({ data: { teamCount: 2, projectCount: 1, tokenCount: 3 } })
        await waitFor(() => expect(confirmBtn).toBeEnabled())
        expect(dialog).toHaveTextContent(/2 teams/i)
        expect(dialog).toHaveTextContent(/1 project/i)
        expect(dialog).toHaveTextContent(/3 api tokens/i)
      })

      it('cancelling the dialog does not call DELETE', async () => {
        mockDeactivated()
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /^delete other@example.com$/i }))
        await screen.findByRole('dialog')
        await user.click(screen.getByRole('button', { name: /^cancel$/i }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(mockDELETE).not.toHaveBeenCalled()
      })

      it('confirming deletes the user and reloads the list', async () => {
        mockDeactivated()
        mockDELETE.mockResolvedValue({ response: { ok: true } })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('other@example.com')

        await user.click(screen.getByRole('button', { name: /^delete other@example.com$/i }))
        const dialog = await screen.findByRole('dialog')
        const confirmBtn = within(dialog).getByRole('button', { name: /^delete$/i })
        await waitFor(() => expect(confirmBtn).toBeEnabled())
        await user.click(confirmBtn)

        await waitFor(() =>
          expect(mockDELETE).toHaveBeenCalledWith('/api/v1/users/{userId}', {
            params: { path: { userId: 'u2' } },
          }),
        )
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

      const teamToggle = screen.getByRole('button', { name: teamToggleName('qa core') })
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

      const teamToggle = screen.getByRole('button', { name: teamToggleName('qa core') })
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

      const teamToggle = screen.getByRole('button', { name: teamToggleName('qa core') })
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

      const teamToggle = screen.getByRole('button', { name: teamToggleName('qa core') })
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

        const teamToggle = screen.getByRole('button', { name: teamToggleName('mobile squad') })
        await user.click(teamToggle)
        const teamCard = teamToggle.closest('li') as HTMLElement
        expect(within(teamCard).queryByPlaceholderText(/search directory/i)).not.toBeInTheDocument()
      })

      it('adds a member via the directory search, not a modal', async () => {
        mockAsTenantAdmin(true)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('Mobile Squad')

        const teamToggle = screen.getByRole('button', { name: teamToggleName('mobile squad') })
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

        const teamToggle = screen.getByRole('button', { name: teamToggleName('mobile squad') })
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

        await user.click(screen.getByRole('button', { name: teamToggleName('qa core') }))
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

        await user.click(screen.getByRole('button', { name: teamToggleName('qa core') }))
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

    describe('delete team (add-team-deletion-preview)', () => {
      function mockTeamPreview() {
        mockGET.mockImplementation((path: string) => {
          if (path === '/api/v1/users/me') {
            return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin: true }, response: { ok: true } })
          }
          if (path === '/api/v1/users') return Promise.resolve({ data: users, response: { ok: true } })
          if (path === '/api/v1/teams') return Promise.resolve({ data: teams, response: { ok: true } })
          if (path === '/api/v1/teams/{teamId}/deletion-preview') {
            return Promise.resolve({ data: { memberCount: 7, projectCount: 2 }, response: { ok: true } })
          }
          return Promise.resolve({ data: [], response: { ok: true } })
        })
      }

      it('shows a Delete action on each team row', async () => {
        mockAsTenantAdmin(true)
        renderPage()
        await screen.findByText('QA Core')

        expect(screen.getByRole('button', { name: /^delete qa core$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^delete mobile squad$/i })).toBeInTheDocument()
      })

      it('opens a confirmation dialog naming the team, disables confirm until real counts load', async () => {
        let resolvePreview: (v: { data: { memberCount: number; projectCount: number } }) => void
        const previewPromise = new Promise<{ data: { memberCount: number; projectCount: number } }>((resolve) => {
          resolvePreview = resolve
        })
        mockGET.mockImplementation((path: string) => {
          if (path === '/api/v1/users/me') {
            return Promise.resolve({ data: { id: 'u1', email: 'me@example.com', isTenantAdmin: true }, response: { ok: true } })
          }
          if (path === '/api/v1/users') return Promise.resolve({ data: users, response: { ok: true } })
          if (path === '/api/v1/teams') return Promise.resolve({ data: teams, response: { ok: true } })
          if (path === '/api/v1/teams/{teamId}/deletion-preview') return previewPromise as Promise<never>
          return Promise.resolve({ data: [], response: { ok: true } })
        })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('QA Core')

        await user.click(screen.getByRole('button', { name: /^delete qa core$/i }))
        const dialog = await screen.findByRole('dialog')
        expect(dialog).toHaveTextContent(/qa core/i)

        const confirmBtn = within(dialog).getByRole('button', { name: /^delete team$/i })
        expect(confirmBtn).toBeDisabled()
        expect(mockGET).toHaveBeenCalledWith(
          '/api/v1/teams/{teamId}/deletion-preview',
          expect.objectContaining({ params: { path: { teamId: 't1' } } }),
        )

        resolvePreview!({ data: { memberCount: 7, projectCount: 2 } })
        await waitFor(() => expect(confirmBtn).toBeEnabled())
        expect(dialog).toHaveTextContent(/7 members/i)
        expect(dialog).toHaveTextContent(/2 projects/i)
      })

      it('cancelling the dialog does not call DELETE', async () => {
        mockTeamPreview()
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('QA Core')

        await user.click(screen.getByRole('button', { name: /^delete qa core$/i }))
        await screen.findByRole('dialog')
        await user.click(screen.getByRole('button', { name: /^cancel$/i }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(mockDELETE).not.toHaveBeenCalled()
      })

      it('confirming deletes the team and reloads the list', async () => {
        mockTeamPreview()
        mockDELETE.mockResolvedValue({ response: { ok: true } })
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('QA Core')

        await user.click(screen.getByRole('button', { name: /^delete qa core$/i }))
        const dialog = await screen.findByRole('dialog')
        const confirmBtn = within(dialog).getByRole('button', { name: /^delete team$/i })
        await waitFor(() => expect(confirmBtn).toBeEnabled())
        await user.click(confirmBtn)

        await waitFor(() =>
          expect(mockDELETE).toHaveBeenCalledWith('/api/v1/teams/{teamId}', {
            params: { path: { teamId: 't1' } },
          }),
        )
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })
})
