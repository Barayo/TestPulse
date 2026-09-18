import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AuthLayout } from './AuthLayout'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
  mockGET.mockResolvedValue({ data: undefined, response: { ok: false } })
})

function renderAuthLayout() {
  return render(
    <MemoryRouter>
      <AuthLayout>
        <div>form content</div>
      </AuthLayout>
    </MemoryRouter>,
  )
}

describe('AuthLayout', () => {
  it('renders its children in the form pane', () => {
    renderAuthLayout()
    expect(screen.getByText('form content')).toBeInTheDocument()
  })

  it('renders the brand mark, a headline, a subheadline, and the three proof lines in the brand pane', () => {
    renderAuthLayout()
    expect(screen.getAllByText('Test').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pulse').length).toBeGreaterThan(0)
    expect(screen.getByText(/open-source test management platform/i)).toBeInTheDocument()
    expect(screen.getByText(/MCP-first, AGPLv3, self-hostable/i)).toBeInTheDocument()
    expect(screen.getByText('AI-native, not AI-bolted-on')).toBeInTheDocument()
    expect(screen.getByText('Genuinely open source')).toBeInTheDocument()
    expect(screen.getByText('Trivially self-hostable')).toBeInTheDocument()
  })

  it('renders an icon alongside each proof line', () => {
    renderAuthLayout()
    const proofItems = document.querySelectorAll('[data-slot="proof-item"]')
    expect(proofItems).toHaveLength(3)
    proofItems.forEach((item) => {
      expect(item.querySelector('svg')).not.toBeNull()
    })
  })

  it('renders a decorative run-result strip in the brand pane', () => {
    renderAuthLayout()
    const strip = document.querySelector('[data-slot="run-strip"]')
    expect(strip).not.toBeNull()
    expect(strip).toHaveAttribute('aria-hidden', 'true')
    expect(strip?.children.length).toBe(8)
  })

  it('renders the brand pane always dark via a nested dark-class container', () => {
    renderAuthLayout()
    const darkPane = document.querySelector('.dark')
    expect(darkPane).not.toBeNull()
    expect(darkPane?.textContent).toContain('Test')
    expect(darkPane?.textContent).toContain('Pulse')
  })

  it('renders the health/version readout without floating it over other content', async () => {
    renderAuthLayout()
    expect(await screen.findByText(/checking|system ready|api unavailable/i)).toBeInTheDocument()
    expect(document.querySelector('.fixed')).toBeNull()
  })

  it('links the brand mark back to home, matching the post-login header logo convention', () => {
    renderAuthLayout()
    const homeLinks = screen.getAllByRole('link', { name: /testpulse/i })
    expect(homeLinks.length).toBeGreaterThan(0)
    homeLinks.forEach((link) => expect(link).toHaveAttribute('href', '/'))
  })
})
