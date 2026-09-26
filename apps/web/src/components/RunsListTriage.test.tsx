import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router'
import { OpenRunsTriage, ClosedRunsLedger } from './RunsListTriage'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type Suite = components['schemas']['Suite']

function run(overrides: Partial<Run> & { name: string }): Run {
  return {
    id: overrides.name,
    key: `p1-${overrides.name}`,
    projectId: 'p1',
    projectKey: 'p1',
    status: 'open',
    archived: false,
    suiteKey: null,
    passRate: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function suite(overrides: Partial<Suite> & { key: string; name: string }): Suite {
  return {
    id: overrides.key,
    projectId: 'p1',
    caseIds: [],
    createdAt: '',
    passRate: null,
    lastRunAt: null,
    ...overrides,
  }
}

function ComparePickerProbe() {
  const { projectKey } = useParams<{ projectKey?: string }>()
  const location = useLocation()
  const state = location.state as { seedRunKey?: string } | null
  return <p data-testid="compare-picker-probe">compare {projectKey} {state ? JSON.stringify(state) : 'no-state'}</p>
}

function renderWithRouter(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/runs']}>
      <Routes>
        <Route path="/projects/:projectKey/runs" element={ui} />
        <Route path="/projects/:projectKey/runs/compare" element={<ComparePickerProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OpenRunsTriage', () => {
  it('renders the lowest-pass-rate run as the hero, with an "At risk" pill', async () => {
    renderWithRouter(
      <OpenRunsTriage
        runs={[run({ name: 'Healthy run', passRate: 90 }), run({ name: 'Risky run', passRate: 25 })]}
      />,
    )
    expect(await screen.findByText('Risky run')).toBeInTheDocument()
    expect(screen.getByText('At risk')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('renders the rest as secondary cards with plain-word captions, no pill', async () => {
    renderWithRouter(
      <OpenRunsTriage
        runs={[run({ name: 'Risky run', passRate: 25 }), run({ name: 'Healthy run', passRate: 90 })]}
      />,
    )
    await screen.findByText('Risky run')
    expect(screen.getByText('Healthy run')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  it('renders only a hero, no secondary column, for a single open run', async () => {
    renderWithRouter(<OpenRunsTriage runs={[run({ name: 'Only run', passRate: 50 })]} />)
    expect(await screen.findByText('Only run')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('links each card to its run execution board', async () => {
    renderWithRouter(<OpenRunsTriage runs={[run({ name: 'Sprint 1', key: 'p1-R1', passRate: 50 })]} />)
    const link = await screen.findByRole('link', { name: /sprint 1/i })
    expect(link).toHaveAttribute('href', '/runs/p1-R1')
  })

  it('shows "No runs yet" for an open run with no items yet', async () => {
    renderWithRouter(
      <OpenRunsTriage runs={[run({ name: 'Fresh run', passRate: null }), run({ name: 'Scored run', passRate: 60 })]} />,
    )
    await screen.findByText('Fresh run')
    expect(screen.getByText('No runs yet')).toBeInTheDocument()
  })

  it('caps at 10 cards with a control to reveal the rest', async () => {
    const runs = Array.from({ length: 13 }, (_, i) => run({ name: `Open ${i + 1}`, passRate: i }))
    renderWithRouter(<OpenRunsTriage runs={runs} />)
    await screen.findByText('Open 1')
    expect(screen.queryByText('Open 11')).not.toBeInTheDocument()
    const showMore = screen.getByRole('button', { name: /show 3 more open runs/i })

    await userEvent.click(showMore)
    expect(await screen.findByText('Open 11')).toBeInTheDocument()
  })
})

describe('ClosedRunsLedger', () => {
  it('groups runs into a suite cluster with a count + average pass-rate header', async () => {
    renderWithRouter(
      <ClosedRunsLedger
        runs={[
          run({ name: 'Smoke A', suiteKey: 'SP-S1', passRate: 50 }),
          run({ name: 'Smoke B', suiteKey: 'SP-S1', passRate: 100 }),
        ]}
        suites={[suite({ key: 'SP-S1', name: 'Smoke' })]}
        projectKey="p1"
      />,
    )
    expect(await screen.findByText('Smoke')).toBeInTheDocument()
    expect(screen.getByText(/2 runs/)).toBeInTheDocument()
    expect(screen.getByText(/avg 75% pass rate/)).toBeInTheDocument()
  })

  it('groups suite-less runs into an "Ad hoc" cluster', async () => {
    renderWithRouter(
      <ClosedRunsLedger runs={[run({ name: 'Scratch run', suiteKey: null, passRate: 0 })]} suites={[]} projectKey="p1" />,
    )
    expect(await screen.findByText('Ad hoc')).toBeInTheDocument()
    expect(screen.getByText('Scratch run')).toBeInTheDocument()
  })

  it('falls back to the raw suite key when the suite no longer resolves (deleted since)', async () => {
    renderWithRouter(
      <ClosedRunsLedger
        runs={[run({ name: 'Orphaned run', suiteKey: 'SP-S9', passRate: 80 })]}
        suites={[]}
        projectKey="p1"
      />,
    )
    expect(await screen.findByText('SP-S9')).toBeInTheDocument()
  })

  it('still offers the "Compare…" row menu per closed run', async () => {
    renderWithRouter(
      <ClosedRunsLedger
        runs={[run({ name: 'Release 1.0', key: 'p1-R1', suiteKey: null, passRate: 90 })]}
        suites={[]}
        projectKey="p1"
      />,
    )
    const row = (await screen.findByText('Release 1.0')).closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: /actions for release 1.0/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /compare/i }))
    expect(await screen.findByTestId('compare-picker-probe')).toHaveTextContent('compare p1 {"seedRunKey":"p1-R1"}')
  })

  it('caps the flattened list at 10 rows before clustering, revealing more on demand', async () => {
    const runs = Array.from({ length: 13 }, (_, i) => run({ name: `Closed ${i + 1}`, suiteKey: 'SP-S1', passRate: 50 }))
    renderWithRouter(<ClosedRunsLedger runs={runs} suites={[suite({ key: 'SP-S1', name: 'Smoke' })]} projectKey="p1" />)
    await screen.findByText('Closed 1')
    expect(screen.queryByText('Closed 11')).not.toBeInTheDocument()
    const showMore = screen.getByRole('button', { name: /show 3 more closed runs/i })

    await userEvent.click(showMore)
    expect(await screen.findByText('Closed 11')).toBeInTheDocument()
  })
})
