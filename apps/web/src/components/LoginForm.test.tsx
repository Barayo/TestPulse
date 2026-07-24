import { createRef } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from './LoginForm'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

beforeEach(() => {
  vi.resetAllMocks()
  mockGET.mockResolvedValue({ data: undefined, response: { ok: false } })
})

function renderForm(props: Partial<React.ComponentProps<typeof LoginForm>> = {}) {
  const onSuccess = props.onSuccess ?? vi.fn()
  render(
    <AuthProvider>
      <LoginForm onSuccess={onSuccess} {...props} />
    </AuthProvider>,
  )
  return { onSuccess }
}

describe('LoginForm', () => {
  it('renders email and password fields and a submit button', async () => {
    renderForm()
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('pre-fills the email field from initialEmail', async () => {
    renderForm({ initialEmail: 'previous@example.com' })
    expect(await screen.findByLabelText(/email/i)).toHaveValue('previous@example.com')
  })

  it('calls onSuccess with the authenticated user on success', async () => {
    mockPOST.mockResolvedValue({
      data: { id: 'u1', email: 'a@b.com', isTenantAdmin: false },
      response: { ok: true },
    })
    const user = userEvent.setup()
    const { onSuccess } = renderForm()

    await user.type(await screen.findByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'correcthorse')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(onSuccess).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.com', isTenantAdmin: false })
  })

  it('exposes the password input via passwordInputRef', async () => {
    const passwordInputRef = createRef<HTMLInputElement>()
    renderForm({ passwordInputRef })
    await screen.findByLabelText(/email/i)
    expect(passwordInputRef.current).toBe(screen.getByLabelText(/password/i))
  })

  it('shows an inline error and does not call onSuccess on failure', async () => {
    mockPOST.mockResolvedValue({ data: undefined, response: { ok: false } })
    const user = userEvent.setup()
    const { onSuccess } = renderForm()

    await user.type(await screen.findByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
