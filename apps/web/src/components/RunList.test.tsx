import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { RunRow, RunSection } from './RunList'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']

const baseRun: Run = {
  id: 'r1',
  key: 'p1-R1',
  projectId: 'p1',
  projectKey: 'p1',
  name: 'Sprint 1',
  status: 'open',
  createdAt: new Date().toISOString(),
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('RunRow', () => {
  it('links to the run, showing its name, health bar, and relative date', () => {
    renderWithRouter(<RunRow run={{ ...baseRun, passRate: 75 }} />)
    const link = screen.getByRole('link', { name: 'Sprint 1' })
    expect(link).toHaveAttribute('href', '/runs/p1-R1')
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('shows "not run yet" when the run has no pass rate', () => {
    renderWithRouter(<RunRow run={{ ...baseRun, passRate: null }} />)
    expect(screen.getByText('not run yet')).toBeInTheDocument()
  })

  it('offers a "Compare…" action for a closed run, navigating with a seedRunKey', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const { MemoryRouter, Route, Routes, useParams } = await import('react-router')
    function ComparePageProbe() {
      const { projectKey } = useParams<{ projectKey: string }>()
      return <p data-testid="compare-probe">compare {projectKey}</p>
    }
    render(
      <MemoryRouter initialEntries={['/projects/p1/runs']}>
        <Routes>
          <Route
            path="/projects/p1/runs"
            element={<RunRow run={{ ...baseRun, status: 'closed', projectKey: 'p1' }} projectKey="p1" />}
          />
          <Route path="/projects/:projectKey/runs/compare" element={<ComparePageProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: /actions for sprint 1/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /compare…/i }))
    expect(await screen.findByTestId('compare-probe')).toHaveTextContent('compare p1')
  })

  it('offers no "Compare…" action for an open run', () => {
    renderWithRouter(<RunRow run={{ ...baseRun, status: 'open' }} projectKey="p1" />)
    expect(screen.queryByRole('button', { name: /actions for sprint 1/i })).not.toBeInTheDocument()
  })

  it('offers no "Compare…" action when no projectKey is given', () => {
    renderWithRouter(<RunRow run={{ ...baseRun, status: 'closed' }} />)
    expect(screen.queryByRole('button', { name: /actions for sprint 1/i })).not.toBeInTheDocument()
  })

  it('suppresses the actions menu entirely when showActions is false, even for a closed run with a projectKey', () => {
    renderWithRouter(<RunRow run={{ ...baseRun, status: 'closed' }} projectKey="p1" showActions={false} />)
    expect(screen.queryByRole('button', { name: /actions for sprint 1/i })).not.toBeInTheDocument()
  })
})

describe('RunSection', () => {
  it('shows the title, count, and each run as a row', () => {
    renderWithRouter(
      <RunSection title="Open" variant="secondary" runs={[baseRun]} emptyMessage="No runs" />,
    )
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sprint 1' })).toBeInTheDocument()
  })

  it('shows the empty message when there are no runs', () => {
    renderWithRouter(<RunSection title="Closed" variant="outline" runs={[]} emptyMessage="No closed runs yet" />)
    expect(screen.getByText('No closed runs yet')).toBeInTheDocument()
  })

  it('caps visible rows and reveals the rest on demand', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const runs = Array.from({ length: 12 }, (_, i) => ({ ...baseRun, id: `r${i}`, key: `p1-R${i}`, name: `Run ${i}` }))
    renderWithRouter(<RunSection title="Closed" variant="outline" runs={runs} emptyMessage="No runs" />)
    expect(screen.getAllByRole('link')).toHaveLength(10)
    await userEvent.click(screen.getByRole('button', { name: /show 2 more/i }))
    expect(screen.getAllByRole('link')).toHaveLength(12)
  })
})
