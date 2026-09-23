import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HealthBadge } from './HealthBadge'
import { AuthProvider } from '@/lib/useAuth'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

beforeEach(() => {
  vi.resetAllMocks()
})

function mockAPI(mcpEnabled: boolean) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/readyz') return Promise.resolve({ response: { ok: true } })
    if (path === '/api/v1/meta') {
      return Promise.resolve({
        data: { version: '0.14.2', setupRequired: false, colorTheme: 'teal', mcpEnabled },
        response: { ok: true },
      })
    }
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
}

function renderBadge() {
  return render(
    <AuthProvider>
      <HealthBadge />
    </AuthProvider>,
  )
}

// mcp-admin-discoverability-card's follow-up: a small public-facing signal
// that this instance exposes MCP, reusing the mcpEnabled field useAuth()
// already resolves from GET /api/v1/meta (Jose's architecture review —
// read from the same shared context InstanceSettingsPage already uses,
// not a second independent parse of HealthBadge's own /meta fetch).
describe('HealthBadge MCP indicator', () => {
  it('shows an MCP badge when the server has MCP enabled', async () => {
    mockAPI(true)
    renderBadge()
    await screen.findByText('System ready')
    expect(await screen.findByText('MCP')).toBeInTheDocument()
  })

  it('shows no MCP badge when the server has MCP disabled', async () => {
    mockAPI(false)
    renderBadge()
    await screen.findByText('System ready')
    await waitFor(() => expect(screen.queryByText('MCP')).not.toBeInTheDocument())
  })

  // Pepe's revision after user feedback ("this badge on grey for MCP makes
  // it look disconnected"): the app already uses variant="outline" as its
  // vocabulary for an ended/closed state (Archived, Closed, EOL) — sitting
  // it next to the solid "System ready" pill read as "the off state" even
  // though it only renders when MCP is actually enabled. Fixed to the same
  // active-state treatment ReleaseStatusBadge's "Active" already uses:
  // no border, tinted with the brand teal, not the neutral outline.
  it('uses the active-state teal tint, not the outline/ended-state treatment', async () => {
    mockAPI(true)
    renderBadge()
    const mcpBadge = await screen.findByText('MCP')
    expect(mcpBadge).not.toHaveAttribute('data-variant', 'outline')
    expect(mcpBadge.className).toContain('bg-primary/10')
    expect(mcpBadge.className).toContain('text-primary')
  })
})
