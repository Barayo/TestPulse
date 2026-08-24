import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import RunComparePage from './RunComparePage'
import { api } from '@/lib/api'
import { AuthProvider } from '@/lib/useAuth'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

const authenticatedUser = { id: 'u1', email: 'admin@example.com', isTenantAdmin: false }

function comparison(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    olderRun: { runKey: 'r-older', runName: 'Sprint 1', createdAt: '2026-01-01T00:00:00Z', total: 2, counts: { pass: 2 } },
    newerRun: { runKey: 'r-newer', runName: 'Sprint 2', createdAt: '2026-01-08T00:00:00Z', total: 2, counts: { pass: 1, failed: 1 } },
    regressed: [{ caseKey: 'C-1', caseTitle: 'Login works', statusOlder: 'pass', statusNewer: 'failed' }],
    improved: [],
    unchanged: [{ caseKey: 'C-2', caseTitle: 'Logout works', statusOlder: 'pass', statusNewer: 'pass' }],
    added: [],
    removed: [],
    ...overrides,
  }
}

function mockCompareAPI(data: ReturnType<typeof comparison> | undefined = comparison()) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/users/me') return Promise.resolve({ data: authenticatedUser, response: { ok: true } })
    if (path === '/api/v1/runs/{runKey}/compare/{otherRunKey}')
      return Promise.resolve({ data, response: { ok: Boolean(data) } })
    return Promise.resolve({ data: undefined, response: { ok: false } })
  })
}

function renderCompare(path = '/runs/compare/r-older/r-newer') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/runs/compare/:runKeyA/:runKeyB" element={<RunComparePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('RunComparePage', () => {
  it('renders both run status charts, older run first', async () => {
    mockCompareAPI()
    renderCompare()
    expect(await screen.findByText('Sprint 1')).toBeInTheDocument()
    expect(screen.getByText('Sprint 2')).toBeInTheDocument()
    const headings = screen.getAllByText(/Sprint \d/).map((el) => el.textContent)
    expect(headings.indexOf('Sprint 1')).toBeLessThan(headings.indexOf('Sprint 2'))
  })

  it('shows a formatted duration when a run has timing data', async () => {
    mockCompareAPI(comparison({ olderRun: { ...comparison().olderRun, totalDurationMs: 252_000 } }))
    renderCompare()
    expect(await screen.findByText('4m 12s')).toBeInTheDocument()
  })

  it('shows "No timing data" when a run has no timing data', async () => {
    mockCompareAPI()
    renderCompare()
    expect(await screen.findAllByText('No timing data')).toHaveLength(2)
  })

  it('shows each run\'s own timing state independently in a mixed pair', async () => {
    mockCompareAPI(comparison({ olderRun: { ...comparison().olderRun, totalDurationMs: 52_000 } }))
    renderCompare()
    expect(await screen.findByText('52s')).toBeInTheDocument()
    expect(screen.getByText('No timing data')).toBeInTheDocument()
  })

  it('shows the item diff categorized into five sections', async () => {
    mockCompareAPI(
      comparison({
        improved: [{ caseKey: 'C-3', caseTitle: 'Checkout works', statusOlder: 'failed', statusNewer: 'pass' }],
        added: [{ caseKey: 'C-4', caseTitle: 'New case', statusNewer: 'pass' }],
        removed: [{ caseKey: 'C-5', caseTitle: 'Old case', statusOlder: 'pass' }],
      }),
    )
    renderCompare()
    await screen.findByText('Login works')
    expect(screen.getByText('Checkout works')).toBeInTheDocument()
    expect(screen.getByText('New case')).toBeInTheDocument()
    expect(screen.getByText('Old case')).toBeInTheDocument()
  })

  it('starts with Unchanged collapsed, expands on click', async () => {
    mockCompareAPI()
    renderCompare()
    await screen.findByText('Login works')
    expect(screen.queryByText('Logout works')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /unchanged/i }))
    expect(screen.getByText('Logout works')).toBeInTheDocument()
  })

  it('shows the old to new status transition for a regressed item', async () => {
    mockCompareAPI()
    renderCompare()
    const row = (await screen.findByText('Login works')).closest('li')!
    expect(within(row).getByText('pass')).toBeInTheDocument()
    expect(within(row).getByText('failed')).toBeInTheDocument()
  })
})

describe('RunComparePage edge states', () => {
  it('collapses Regressed/Improved into one void card when both are empty', async () => {
    mockCompareAPI(comparison({ regressed: [], unchanged: [{ caseKey: 'C-2', caseTitle: 'Logout works', statusOlder: 'pass', statusNewer: 'pass' }] }))
    renderCompare()
    await screen.findByText(/no regressions or improvements/i)
    expect(screen.queryByText(/no cases regressed/i)).not.toBeInTheDocument()
  })

  it('shows a near-zero-overlap notice instead of the good-news framing', async () => {
    mockCompareAPI(
      comparison({
        regressed: [],
        improved: [],
        unchanged: [{ caseKey: 'C-2', caseTitle: 'Logout works', statusOlder: 'pass', statusNewer: 'pass' }],
        added: Array.from({ length: 12 }, (_, i) => ({ caseKey: `A-${i}`, caseTitle: `Added ${i}`, statusNewer: 'pass' })),
      }),
    )
    renderCompare()
    await screen.findByText(/only 1 of 13 cases ran in both runs/i)
    expect(screen.queryByText(/no regressions or improvements/i)).not.toBeInTheDocument()
  })
})
