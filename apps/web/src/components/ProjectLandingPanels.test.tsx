import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FoldersPanel, SuitesPanel, RunsPanel } from './ProjectLandingPanels'

describe('FoldersPanel', () => {
  it('shows top folders with their case count and a link to the rest', () => {
    render(
      <FoldersPanel
        folders={[{ id: 'f1', name: 'Onboarding & KYC', caseCount: 14 }]}
        totalCount={6}
        onSeeAll={vi.fn()}
        onSelectFolder={vi.fn()}
      />,
    )
    expect(screen.getByText('Onboarding & KYC')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText(/see all 6/i)).toBeInTheDocument()
  })

  it('shows an empty state when there are no sections yet, with a working link to the library', async () => {
    const onSeeAll = vi.fn()
    render(<FoldersPanel folders={[]} totalCount={0} onSeeAll={onSeeAll} onSelectFolder={vi.fn()} />)
    expect(screen.getByText(/no sections yet/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to library/i }))
    expect(onSeeAll).toHaveBeenCalled()
  })

  it('navigates to see-all when clicking the panel title, not only the "see all" text', async () => {
    const onSeeAll = vi.fn()
    render(
      <FoldersPanel
        folders={[{ id: 'f1', name: 'Onboarding & KYC', caseCount: 14 }]}
        totalCount={6}
        onSeeAll={onSeeAll}
        onSelectFolder={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByText('Library'))
    expect(onSeeAll).toHaveBeenCalled()
  })
})

describe('SuitesPanel', () => {
  it('shows top suites with their case count and no pass rate', () => {
    render(
      <SuitesPanel
        suites={[{ id: 's1', name: 'Smoke — Release 4.2', caseCount: 12 }]}
        totalCount={7}
        onSeeAll={vi.fn()}
        onSelectSuite={vi.fn()}
      />,
    )
    expect(screen.getByText('Smoke — Release 4.2')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText(/see all 7/i)).toBeInTheDocument()
    expect(screen.queryByText('%')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no suites yet, with a working link to the suites page', async () => {
    const onSeeAll = vi.fn()
    render(<SuitesPanel suites={[]} totalCount={0} onSeeAll={onSeeAll} onSelectSuite={vi.fn()} />)
    expect(screen.getByText(/no suites yet/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to suites/i }))
    expect(onSeeAll).toHaveBeenCalled()
  })

  it('navigates directly to a suite when its row is clicked', async () => {
    const onSelectSuite = vi.fn()
    render(
      <SuitesPanel
        suites={[{ id: 's1', name: 'Smoke — Release 4.2', caseCount: 12 }]}
        totalCount={7}
        onSeeAll={vi.fn()}
        onSelectSuite={onSelectSuite}
      />,
    )
    await userEvent.click(screen.getByText('Smoke — Release 4.2'))
    expect(onSelectSuite).toHaveBeenCalledWith('s1')
  })
})

describe('RunsPanel', () => {
  it('shows recent runs with their pass rate', () => {
    render(
      <RunsPanel
        runs={[{ id: 'r1', name: 'Smoke — Release 4.2', createdAt: '2026-01-01T00:00:00Z', passRate: 92 }]}
        totalCount={5}
        onSeeAll={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )
    expect(screen.getByText('Smoke — Release 4.2')).toBeInTheDocument()
    expect(screen.getByText(/92%/)).toBeInTheDocument()
    expect(screen.getByText(/see all/i)).toBeInTheDocument()
  })

  it('navigates directly to a run when its row is clicked', async () => {
    const onSelectRun = vi.fn()
    render(
      <RunsPanel
        runs={[{ id: 'r1', name: 'Smoke — Release 4.2', createdAt: '2026-01-01T00:00:00Z', passRate: 92 }]}
        totalCount={5}
        onSeeAll={vi.fn()}
        onSelectRun={onSelectRun}
      />,
    )
    await userEvent.click(screen.getByText('Smoke — Release 4.2'))
    expect(onSelectRun).toHaveBeenCalledWith('r1')
  })

  it('color-codes the health bar by pass rate (mid and low bands)', () => {
    render(
      <RunsPanel
        runs={[
          { id: 'r3', name: 'Mid health run', createdAt: '2026-01-01T00:00:00Z', passRate: 60 },
          { id: 'r4', name: 'Low health run', createdAt: '2026-01-01T00:00:00Z', passRate: 20 },
        ]}
        totalCount={2}
        onSeeAll={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )
    expect(screen.getByText(/60%/)).toBeInTheDocument()
    expect(screen.getByText(/20%/)).toBeInTheDocument()
  })

  it('shows "not run yet" for a run with no recorded results yet', () => {
    render(
      <RunsPanel
        runs={[{ id: 'r2', name: 'Just created', createdAt: '2026-01-01T00:00:00Z', passRate: null }]}
        totalCount={1}
        onSeeAll={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )
    expect(screen.getByText(/not run yet/i)).toBeInTheDocument()
  })

  it('shows an empty state when there are no runs yet, with a working link to the runs page', async () => {
    const onSeeAll = vi.fn()
    render(<RunsPanel runs={[]} totalCount={0} onSeeAll={onSeeAll} onSelectRun={vi.fn()} />)
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to runs/i }))
    expect(onSeeAll).toHaveBeenCalled()
  })
})
