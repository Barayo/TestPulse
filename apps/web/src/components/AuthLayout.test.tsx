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

  it('renders a real circle shape in the top-right corner, not a gradient falloff', () => {
    // A radial-gradient glow (no discernible edge) was tried first and
    // rejected — founder wants an actual circle silhouette. A real
    // rounded-full element, blurred for softness, positioned top-right,
    // away from the run-strip bars entirely so it can't clip badly
    // against them the way the earlier bottom-right blob did.
    renderAuthLayout()
    const circle = document.querySelector('[data-slot="brandpane-glow"]')
    expect(circle).not.toBeNull()
    expect(circle).toHaveAttribute('aria-hidden', 'true')
    expect(circle).toHaveClass('rounded-full')
  })

  it('gives the brand pane a grained surface', () => {
    renderAuthLayout()
    const surfaces = document.querySelectorAll('.auth-brandpane-surface')
    // Both the mobile condensed band and the full desktop pane get the
    // same surface treatment, not just the desktop one.
    expect(surfaces.length).toBe(2)
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
