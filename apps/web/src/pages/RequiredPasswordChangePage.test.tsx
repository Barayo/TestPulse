import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import RequiredPasswordChangePage from './RequiredPasswordChangePage'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

let hrefSet = ''

beforeEach(() => {
  vi.resetAllMocks()
  mockGET.mockResolvedValue({ data: undefined, response: { ok: false } })
  hrefSet = ''
  vi.stubGlobal('location', {
    ...window.location,
    get href() {
      return hrefSet
    },
    set href(v: string) {
      hrefSet = v
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RequiredPasswordChangePage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('RequiredPasswordChangePage', () => {
  it('explains why, and offers the change-password form', () => {
    renderPage()
    expect(screen.getByText(/requires a new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
  })

  it('has no Cancel button — mandatory, no dismiss', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
  })

  it('navigates to /login on a successful change', async () => {
    mockPOST.mockResolvedValue({ data: undefined, error: undefined, response: { ok: true, status: 204 } as Response })
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/current password/i), 'correcthorse-old')
    await user.type(screen.getByLabelText(/^new password$/i), 'correcthorse-new')
    await user.click(screen.getByRole('button', { name: /set new password/i }))

    await vi.waitFor(() => expect(hrefSet).toBe('/login'))
  })
})
