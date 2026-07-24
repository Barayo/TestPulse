import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionExpiredModal } from './SessionExpiredModal'
import { AuthProvider, useAuth } from '@/lib/useAuth'
import { notifySessionExpired } from '@/lib/sessionExpiry'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

const reload = vi.fn()
let hrefSet = ''

beforeEach(() => {
  vi.resetAllMocks()
  reload.mockReset()
  hrefSet = ''
  vi.stubGlobal('location', {
    ...window.location,
    reload,
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

// Surfaces useAuth().user in the DOM so tests can wait for the session
// check to actually resolve (not just for the GET call to have been made —
// notifySessionExpired is a no-op while user is still null, so racing that
// gap makes these tests flaky for the wrong reason).
function UserProbe() {
  const { user } = useAuth()
  return <span data-testid="user-probe">{user?.email ?? ''}</span>
}

async function renderExpiredModal(email = 'a@b.com') {
  mockGET.mockResolvedValue({ data: { id: 'u1', email, isTenantAdmin: false }, response: { ok: true } })
  render(
    <AuthProvider>
      <UserProbe />
      <SessionExpiredModal />
    </AuthProvider>,
  )
  await screen.findByText(email)
  notifySessionExpired()
  return screen.findByRole('dialog')
}

describe('SessionExpiredModal', () => {
  it('renders nothing until a session-expiry notification arrives', async () => {
    mockGET.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    render(
      <AuthProvider>
        <UserProbe />
        <SessionExpiredModal />
      </AuthProvider>,
    )
    await screen.findByText('a@b.com')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens, explains why, and pre-fills the previous user email once notified', async () => {
    const dialog = await renderExpiredModal()
    expect(dialog).toHaveTextContent(/session has expired/i)
    expect(screen.getByLabelText(/email/i)).toHaveValue('a@b.com')
  })

  it('cannot be dismissed via Escape', async () => {
    await renderExpiredModal()

    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('has no close button', async () => {
    await renderExpiredModal()

    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
  })

  it('reloads the current URL when re-authenticating as the same user', async () => {
    mockPOST.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    const user = userEvent.setup()
    await renderExpiredModal()

    await user.type(screen.getByLabelText(/password/i), 'correcthorse')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(hrefSet).toBe('')
  })

  it('navigates home when re-authenticating as a different user', async () => {
    mockPOST.mockResolvedValue({
      data: { id: 'u2', email: 'someoneelse@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    const user = userEvent.setup()
    await renderExpiredModal()

    await user.clear(screen.getByLabelText(/email/i))
    await user.type(screen.getByLabelText(/email/i), 'someoneelse@b.com')
    await user.type(screen.getByLabelText(/password/i), 'correcthorse')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await vi.waitFor(() => expect(hrefSet).toBe('/'))
    expect(reload).not.toHaveBeenCalled()
  })
})
