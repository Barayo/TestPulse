import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { VersionDetailDialog } from './VersionDetailDialog'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

const baseContent = {
  title: 'Login works',
  description: 'Checks the login flow',
  steps: [{ action: 'Open login page', expected: 'Form visible' }],
  expectedResult: '',
  priority: 'medium' as const,
  tags: ['smoke'],
  platform: 'web',
  testType: 'e2e',
  automated: false,
}

const v1 = { caseId: 'c1', version: 1, content: baseContent, actorKind: 'unknown' as const, createdAt: '2026-01-01T00:00:00Z' }
const v2 = {
  caseId: 'c1',
  version: 2,
  content: {
    ...baseContent,
    title: 'Login works (updated)',
    steps: [{ action: 'Open login page', expected: 'Form visible with SSO button' }],
  },
  actorKind: 'unknown' as const,
  createdAt: '2026-02-01T00:00:00Z',
}

function mockExecutions(execs: unknown[] = [], anonymous = false) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/cases/{caseKey}/executions' && !anonymous)
      return Promise.resolve({ data: execs, response: { ok: true } })
    if (path === '/api/v1/public/cases/{caseKey}/executions' && anonymous)
      return Promise.resolve({ data: execs, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

function renderDialog(
  props: Omit<Parameters<typeof VersionDetailDialog>[0], 'onOpenChange' | 'access'> & {
    access?: Parameters<typeof VersionDetailDialog>[0]['access']
  },
) {
  return render(
    <MemoryRouter>
      <VersionDetailDialog {...props} access={props.access ?? 'member'} onOpenChange={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('VersionDetailDialog', () => {
  it('shows only fields that changed relative to the previous version', async () => {
    mockExecutions()
    renderDialog({ open: true, caseKey: 'c1', version: 2, versions: [v2, v1] })
    await screen.findByText('Login works (updated)')
    expect(screen.getByText('Form visible with SSO button')).toBeInTheDocument()
    // Unchanged fields (description, tags, platform, testType) are not rendered as diff noise.
    expect(screen.queryByText('Checks the login flow')).not.toBeInTheDocument()
    expect(screen.queryByText('smoke')).not.toBeInTheDocument()
  })

  it('says there is no previous version to compare against for the first version', async () => {
    mockExecutions()
    renderDialog({ open: true, caseKey: 'c1', version: 1, versions: [v1] })
    await screen.findByText(/no previous version/i)
  })

  it('lists executions that pinned the open version, with run name and verdict', async () => {
    mockExecutions([
      { runItemId: 'i1', runId: 'r1', runKey: 'r1', runName: 'Sprint 1', caseVersion: 2, status: 'pass', createdAt: '2026-02-02T00:00:00Z' },
      { runItemId: 'i2', runId: 'r2', runKey: 'r2', runName: 'Sprint 0', caseVersion: 1, status: 'failed', createdAt: '2026-01-02T00:00:00Z' },
    ])
    renderDialog({ open: true, caseKey: 'c1', version: 2, versions: [v2, v1] })
    await screen.findByText('Sprint 1')
    expect(screen.queryByText('Sprint 0')).not.toBeInTheDocument()
  })

  it('flags a version as Flaky when it has both a pass and a failed/blocked execution', async () => {
    mockExecutions([
      { runItemId: 'i1', runId: 'r1', runKey: 'r1', runName: 'Sprint 1', caseVersion: 2, status: 'pass', createdAt: '2026-02-02T00:00:00Z' },
      { runItemId: 'i2', runId: 'r2', runKey: 'r2', runName: 'Sprint 2', caseVersion: 2, status: 'failed', createdAt: '2026-02-03T00:00:00Z' },
    ])
    renderDialog({ open: true, caseKey: 'c1', version: 2, versions: [v2, v1] })
    await waitFor(() => expect(screen.getByText('Sprint 1')).toBeInTheDocument())
    expect(screen.getByText(/flaky/i)).toBeInTheDocument()
  })

  it('does not flag a version as Flaky when all its executions agree, or it has none', async () => {
    mockExecutions([
      { runItemId: 'i1', runId: 'r1', runKey: 'r1', runName: 'Sprint 1', caseVersion: 2, status: 'pass', createdAt: '2026-02-02T00:00:00Z' },
    ])
    renderDialog({ open: true, caseKey: 'c1', version: 2, versions: [v2, v1] })
    await waitFor(() => expect(screen.getByText('Sprint 1')).toBeInTheDocument())
    expect(screen.queryByText(/flaky/i)).not.toBeInTheDocument()
  })

  it('links each execution to its own run item page', async () => {
    mockExecutions([
      { runItemId: 'i1', runId: 'r1', runKey: 'r1', runName: 'Sprint 1', caseVersion: 2, status: 'pass', createdAt: '2026-02-02T00:00:00Z' },
    ])
    renderDialog({ open: true, caseKey: 'c1', version: 2, versions: [v2, v1] })
    const link = await screen.findByRole('link', { name: /sprint 1/i })
    expect(link).toHaveAttribute('href', '/runs/r1/items/c1')
  })

  // Dual-mode migration (unify-authenticated-and-public-views tasks.md
  // 4.1): a satellite fetch inside CaseDetailPage's "View executions"
  // dialog, easy to miss since it's a separate component's own effect.
  // The parent page now passes its own useProjectReadAccess result down
  // as the `access` prop (design.md D11) rather than the dialog deriving
  // its own from useAuth() — 'public' covers both anonymous visitors and
  // signed-in non-members identically.
  it('fetches from the public executions endpoint when access is public', async () => {
    mockExecutions(
      [{ runItemId: 'i1', runId: 'r1', runKey: 'r1', runName: 'Sprint 1', caseVersion: 2, status: 'pass', createdAt: '' }],
      true,
    )
    renderDialog({ open: true, caseKey: 'c1', version: 2, versions: [v2, v1], access: 'public' })
    await screen.findByText('Sprint 1')
    expect(mockGET).toHaveBeenCalledWith('/api/v1/public/cases/{caseKey}/executions', expect.anything())
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/cases/{caseKey}/executions', expect.anything())
  })

  it('fires no executions request while access is still loading', async () => {
    mockGET.mockImplementation(() => Promise.resolve({ data: undefined, response: { ok: true } }))
    renderDialog({ open: true, caseKey: 'c1', version: 2, versions: [v2, v1], access: 'loading' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/cases/{caseKey}/executions', expect.anything())
    expect(mockGET).not.toHaveBeenCalledWith('/api/v1/public/cases/{caseKey}/executions', expect.anything())
  })
})
