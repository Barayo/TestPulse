import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import ProfilePage from './ProfilePage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPATCH = vi.mocked(api.PATCH)
const mockDELETE = vi.mocked(api.DELETE)

const meResponse = {
  id: 'u1',
  email: 'ana@example.com',
  isTenantAdmin: false,
  displayName: null,
  avatarKey: null,
  timezone: null,
  createdAt: '',
}

function mockMe(user: unknown = meResponse) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') return Promise.resolve({ data: user, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/profile']}>
      <AuthProvider>
        <Routes>
          <Route path="/settings/profile" element={<ProfilePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
})

describe('ProfilePage', () => {
  it('shows the current display name, avatar, and timezone', async () => {
    mockMe({ ...meResponse, displayName: 'Ana', avatarKey: 'ada-lovelace', timezone: 'Europe/Madrid' })
    renderPage()

    expect(await screen.findByDisplayValue('Ana')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Europe/Madrid')).toBeInTheDocument()
  })

  it('lists every avatar preset plus a generated-default option', async () => {
    mockMe()
    renderPage()
    await screen.findByLabelText(/display name/i)

    expect(screen.getByRole('radio', { name: /ada lovelace/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /emmy noether/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /generated default/i })).toBeInTheDocument()
  })

  it('saving calls PATCH /api/v1/users/me and reflects the update', async () => {
    mockMe()
    mockPATCH.mockResolvedValue({
      data: { ...meResponse, displayName: 'Ana R.', avatarKey: 'grace-hopper', timezone: 'Europe/Madrid' },
      response: { ok: true },
    })
    renderPage()
    const nameInput = await screen.findByLabelText(/display name/i)

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Ana R.')
    await userEvent.click(screen.getByRole('radio', { name: /grace hopper/i }))
    await userEvent.type(screen.getByLabelText(/timezone/i), 'Europe/Madrid')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockPATCH).toHaveBeenCalledWith(
        '/api/v1/users/me',
        expect.objectContaining({
          body: { displayName: 'Ana R.', avatarKey: 'grace-hopper', timezone: 'Europe/Madrid' },
        }),
      )
    })
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
  })

  it('always links to API tokens', async () => {
    mockMe()
    renderPage()
    await screen.findByLabelText(/display name/i)
    expect(screen.getByRole('link', { name: /api tokens/i })).toHaveAttribute('href', '/settings/tokens')
  })

  it('does not duplicate instance administration here, admin or not — that stays under the top-level Admin menu', async () => {
    mockMe({ ...meResponse, isTenantAdmin: true })
    renderPage()
    await screen.findByLabelText(/display name/i)
    expect(screen.queryByRole('link', { name: /manage users/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^people$/i })).not.toBeInTheDocument()
  })

  it('shows a disabled password-change entry as a coming-soon placeholder', async () => {
    mockMe()
    renderPage()
    await screen.findByLabelText(/display name/i)
    const changePassword = screen.getByRole('button', { name: /change password/i })
    expect(changePassword).toBeDisabled()
  })

  it('the coming-soon label is visible text, not only a hover tooltip (Pepe review)', async () => {
    mockMe()
    renderPage()
    await screen.findByLabelText(/display name/i)
    expect(screen.getByText(/coming soon/i)).toBeVisible()
  })

  describe('Appearance (add-dark-mode-toggle, moved here after design review — a set-once whole-app preference belongs on the deliberately-navigated-to settings page, not a transient account dropdown)', () => {
    it('shows an Appearance card with a System/Light/Dark theme control', async () => {
      mockMe()
      renderPage()
      await screen.findByLabelText(/display name/i)
      expect(screen.getByText('Appearance')).toBeInTheDocument()
      const group = screen.getByRole('group', { name: /theme/i })
      expect(group).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^system$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^light$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^dark$/i })).toBeInTheDocument()
    })

    it('marks System active by default with no stored override', async () => {
      mockMe()
      renderPage()
      await screen.findByLabelText(/display name/i)
      expect(screen.getByRole('button', { name: /^system$/i })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /^light$/i })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /^dark$/i })).toHaveAttribute('aria-pressed', 'false')
    })

    it('clicking Dark sets the override and marks Dark active', async () => {
      mockMe()
      renderPage()
      await screen.findByLabelText(/display name/i)
      await userEvent.click(screen.getByRole('button', { name: /^dark$/i }))
      expect(screen.getByRole('button', { name: /^dark$/i })).toHaveAttribute('aria-pressed', 'true')
      expect(window.localStorage.getItem('testpulse.themeOverride')).toBe('dark')
    })

    it('clicking System after an override clears it', async () => {
      window.localStorage.setItem('testpulse.themeOverride', 'light')
      mockMe()
      renderPage()
      await screen.findByLabelText(/display name/i)
      expect(screen.getByRole('button', { name: /^light$/i })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(screen.getByRole('button', { name: /^system$/i }))
      expect(screen.getByRole('button', { name: /^system$/i })).toHaveAttribute('aria-pressed', 'true')
      expect(window.localStorage.getItem('testpulse.themeOverride')).toBeNull()
    })
  })

  describe('custom photo avatar upload (add-custom-avatar-upload, Pepe interaction design)', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
    })

    it('shows an upload control in the avatar picker', async () => {
      mockMe()
      renderPage()
      await screen.findByLabelText(/display name/i)
      expect(screen.getByRole('button', { name: /upload a photo/i })).toBeInTheDocument()
    })

    it('selecting a valid file uploads it immediately and selects the resulting avatar', async () => {
      mockMe()
      renderPage()
      await screen.findByLabelText(/display name/i)

      const updatedMe = { ...meResponse, avatarKey: 'custom' }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updatedMe),
      } as Response)
      mockMe(updatedMe)

      const file = new File(['fake-jpeg-bytes'], 'photo.jpg', { type: 'image/jpeg' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, file)

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/v1/users/me/avatar',
          expect.objectContaining({ method: 'POST', credentials: 'include' }),
        )
      })
      expect(await screen.findByRole('button', { name: /^remove$/i })).toBeInTheDocument()
    })

    it('rejects an oversized file client-side, with an inline error, without calling the endpoint', async () => {
      mockMe()
      renderPage()
      await screen.findByLabelText(/display name/i)

      const file = new File(['x'], 'huge.jpg', { type: 'image/jpeg' })
      Object.defineProperty(file, 'size', { value: 600 * 1024 })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      await userEvent.upload(input, file)

      expect(await screen.findByText(/500 ?KB/i)).toBeInTheDocument()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('rejects a wrong-type file client-side, with an inline error, without calling the endpoint', async () => {
      mockMe()
      renderPage()
      await screen.findByLabelText(/display name/i)

      const file = new File(['fake-gif-bytes'], 'screenshot.gif', { type: 'image/gif' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      // A real user can still pick a mismatched file (drag-drop, "All
      // Files" in the OS picker) despite `accept` — bypass user-event's
      // own accept-filtering so this exercises our client-side check.
      await userEvent.upload(input, file, { applyAccept: false })

      expect(await screen.findByText(/jpeg, png, or webp/i)).toBeInTheDocument()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('shows a Remove action only once a custom avatar is set, and removing calls the delete endpoint', async () => {
      mockMe({ ...meResponse, avatarKey: 'custom' })
      renderPage()
      // avatarKey syncs from the loaded user via an effect that runs after
      // mount — await it directly (findBy retries) rather than asserting
      // synchronously right after an unrelated findByLabelText resolves.
      const removeButton = await screen.findByRole('button', { name: /^remove$/i })

      mockDELETE.mockResolvedValue({
        data: { ...meResponse, avatarKey: null },
        response: { ok: true },
      })
      mockMe({ ...meResponse, avatarKey: null })

      await userEvent.click(removeButton)

      await waitFor(() => {
        expect(mockDELETE).toHaveBeenCalledWith('/api/v1/users/me/avatar', expect.anything())
      })
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument()
      })
    })

    it('does not show a Remove action when no custom avatar is set', async () => {
      mockMe()
      renderPage()
      await screen.findByLabelText(/display name/i)
      expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument()
    })
  })
})
