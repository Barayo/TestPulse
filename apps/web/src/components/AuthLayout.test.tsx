import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthLayout } from './AuthLayout'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
  mockGET.mockResolvedValue({ data: undefined, response: { ok: false } })
})

describe('AuthLayout', () => {
  it('renders its children in the form pane', () => {
    render(
      <AuthLayout>
        <div>form content</div>
      </AuthLayout>,
    )
    expect(screen.getByText('form content')).toBeInTheDocument()
  })

  it('renders the brand mark, a headline, and the three proof lines in the brand pane', () => {
    render(
      <AuthLayout>
        <div>form content</div>
      </AuthLayout>,
    )
    expect(screen.getAllByText('Test').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pulse').length).toBeGreaterThan(0)
    expect(screen.getByText(/open-source test management platform/i)).toBeInTheDocument()
    expect(screen.getByText('AI-native, not AI-bolted-on')).toBeInTheDocument()
    expect(screen.getByText('Genuinely open source')).toBeInTheDocument()
    expect(screen.getByText('Trivially self-hostable')).toBeInTheDocument()
  })

  it('renders the brand pane always dark via a nested dark-class container', () => {
    render(
      <AuthLayout>
        <div>form content</div>
      </AuthLayout>,
    )
    const darkPane = document.querySelector('.dark')
    expect(darkPane).not.toBeNull()
    expect(darkPane?.textContent).toContain('Test')
    expect(darkPane?.textContent).toContain('Pulse')
  })

  it('renders the health/version readout without floating it over other content', async () => {
    render(
      <AuthLayout>
        <div>form content</div>
      </AuthLayout>,
    )
    expect(await screen.findByText(/checking|system ready|api unavailable/i)).toBeInTheDocument()
    expect(document.querySelector('.fixed')).toBeNull()
  })
})
