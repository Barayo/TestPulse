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

function mockExecutions(execs: unknown[] = []) {
  mockGET.mockResolvedValue({ data: execs, response: { ok: true } })
}

function renderDialog(props: Omit<Parameters<typeof VersionDetailDialog>[0], 'onOpenChange'>) {
  return render(
    <MemoryRouter>
      <VersionDetailDialog {...props} onOpenChange={() => {}} />
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
})
