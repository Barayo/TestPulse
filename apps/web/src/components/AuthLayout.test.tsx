import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AuthLayout } from './AuthLayout'
import { AuthProvider } from '@/lib/useAuth'
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
      <AuthProvider>
        <AuthLayout>
          <div>form content</div>
        </AuthLayout>
      </AuthProvider>
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

  it('renders the colored run-strip bars but no run-count or pass/fail claim', () => {
    // The bars are purely decorative — no text asserts they're real data.
    // Only the specific numeric caption ("14 passed") was the honesty
    // problem (a claim with no real data behind it on a public
    // unauthenticated page); the bars themselves were never that and
    // stay, since founder feedback confirmed removing them read as
    // boring, not as fixing anything.
    renderAuthLayout()
    const strip = document.querySelector('[data-slot="run-strip"]')
    expect(strip).not.toBeNull()
    expect(strip).toHaveAttribute('aria-hidden', 'true')
    const bars = strip?.querySelectorAll('[data-slot="run-strip-bar"]') ?? []
    expect(bars.length).toBe(16)
    expect(screen.queryByText(/passed/i)).toBeNull()
    expect(screen.queryByText(/last \d+ runs/i)).toBeNull()
  })

  it('gives the brand pane a grained surface', () => {
    renderAuthLayout()
    const surfaces = document.querySelectorAll('.auth-brandpane-surface')
    // Both the mobile condensed band and the full desktop pane get the
    // same surface treatment, not just the desktop one.
    expect(surfaces.length).toBe(2)
  })

  it('renders a real, sized circle tucked in the top-right corner, not a gradient bleeding across the pane', () => {
    // A CSS radial-gradient's effective size depends on the container's
    // aspect ratio (farthest-corner sizing) — on the real tall, narrow
    // pane it scaled to fill the middle, not stay cornered. A fixed-size
    // positioned element keeps it genuinely in the corner regardless of
    // viewport height.
    renderAuthLayout()
    const circle = document.querySelector('[data-slot="brandpane-glow"]')
    expect(circle).not.toBeNull()
    expect(circle).toHaveAttribute('aria-hidden', 'true')
    expect(circle).toHaveClass('rounded-full')
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

  it('renders no exit link by default, and renders it in a top-right topbar (not the centered card stack) when backLink is given', () => {
    // Pepe design review: a bottom-center exit link, grouped with the card,
    // was rejected as "correct weight, wrong position" — it should mirror
    // Layout.tsx's own top-right "Log in" slot instead, so it's visible
    // pre-scroll and reads as page-level navigation, not part of the form.
    const { rerender } = render(
      <MemoryRouter>
        <AuthProvider>
          <AuthLayout>
            <div>form content</div>
          </AuthLayout>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /back to/i })).toBeNull()

    rerender(
      <MemoryRouter>
        <AuthProvider>
          <AuthLayout backLink={{ to: '/login', label: 'Back to log in' }}>
            <div>form content</div>
          </AuthLayout>
        </AuthProvider>
      </MemoryRouter>,
    )
    const topbar = document.querySelector('[data-slot="auth-backlink"]')
    expect(topbar).not.toBeNull()
    const link = screen.getByRole('link', { name: 'Back to log in' })
    expect(link).toHaveAttribute('href', '/login')
    expect(topbar?.contains(link)).toBe(true)
    // Not inside the centered content stack alongside the card.
    expect(document.querySelector('[data-slot="auth-content-stack"]')?.contains(link)).toBe(false)
  })
})
