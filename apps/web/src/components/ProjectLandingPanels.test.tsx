import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FoldersPanel, SuitesPanel, RunsPanel } from './ProjectLandingPanels'

describe('FoldersPanel', () => {
  it('shows top folders with their case count, a magnitude bar, and a link to the rest', () => {
    render(
      <FoldersPanel
        folders={[
          { id: 'f1', name: 'Onboarding & KYC', caseCount: 14, subsectionCount: 0, children: [] },
          { id: 'f2', name: 'Small', caseCount: 7, subsectionCount: 0, children: [] },
        ]}
        totalCount={6}
        onSeeAll={vi.fn()}
        onSelectFolder={vi.fn()}
      />,
    )
    const bigRow = screen.getByText('Onboarding & KYC').closest('li') as HTMLElement
    const smallRow = screen.getByText('Small').closest('li') as HTMLElement
    expect(within(bigRow).getByText('14 cases')).toBeInTheDocument()
    expect((bigRow.querySelector('[data-fill]') as HTMLElement).style.width).toBe('100%')
    expect((smallRow.querySelector('[data-fill]') as HTMLElement).style.width).toBe('50%')
    expect(screen.getByText(/see all 6/i)).toBeInTheDocument()
  })

  it('shows an empty section with an italic name, "No cases yet", and no magnitude bar', () => {
    render(
      <FoldersPanel
        folders={[{ id: 'f1', name: 'Onboarding', caseCount: 0, subsectionCount: 0, children: [] }]}
        totalCount={1}
        onSeeAll={vi.fn()}
        onSelectFolder={vi.fn()}
      />,
    )
    const row = screen.getByText('Onboarding').closest('li') as HTMLElement
    expect(row.querySelector('.italic')).not.toBeNull()
    expect(row.querySelector('[data-fill]')).toBeNull()
    expect(within(row).getByText(/no cases yet/i)).toBeInTheDocument()
  })

  it('shows a subsection-count badge and, on expand, previews immediate children', async () => {
    render(
      <FoldersPanel
        folders={[
          {
            id: 'f1',
            name: 'Regression',
            caseCount: 6,
            subsectionCount: 2,
            children: [
              { id: 'f1a', name: 'Smoke', caseCount: 3 },
              { id: 'f1b', name: 'Sanity', caseCount: 3 },
            ],
          },
        ]}
        totalCount={1}
        onSeeAll={vi.fn()}
        onSelectFolder={vi.fn()}
      />,
    )
    expect(screen.getByText('2 subsections')).toBeInTheDocument()
    expect(screen.queryByText('Smoke')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /expand regression/i }))
    expect(screen.getByText('Smoke')).toBeInTheDocument()
    expect(screen.getByText('Sanity')).toBeInTheDocument()
  })

  it('clicking a child row navigates to that child, not the parent', async () => {
    const onSelectFolder = vi.fn()
    render(
      <FoldersPanel
        folders={[
          {
            id: 'f1',
            name: 'Regression',
            caseCount: 6,
            subsectionCount: 1,
            children: [{ id: 'f1a', name: 'Smoke', caseCount: 6 }],
          },
        ]}
        totalCount={1}
        onSeeAll={vi.fn()}
        onSelectFolder={onSelectFolder}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /expand regression/i }))
    await userEvent.click(screen.getByText('Smoke'))
    expect(onSelectFolder).toHaveBeenCalledWith('f1a')
    expect(onSelectFolder).not.toHaveBeenCalledWith('f1')
  })

  it('a section with no subsections navigates directly on row click', async () => {
    const onSelectFolder = vi.fn()
    render(
      <FoldersPanel
        folders={[{ id: 'f1', name: 'Settings', caseCount: 4, subsectionCount: 0, children: [] }]}
        totalCount={1}
        onSeeAll={vi.fn()}
        onSelectFolder={onSelectFolder}
      />,
    )
    await userEvent.click(screen.getByText('Settings'))
    expect(onSelectFolder).toHaveBeenCalledWith('f1')
  })

  it('shows an empty state when there are no sections yet, with a working link to the library', async () => {
    const onSeeAll = vi.fn()
    render(<FoldersPanel folders={[]} totalCount={0} onSeeAll={onSeeAll} onSelectFolder={vi.fn()} />)
    expect(screen.getByText(/no sections yet/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to library/i }))
    expect(onSeeAll).toHaveBeenCalled()
  })
})

describe('SuitesPanel', () => {
  it('shows top suites with their case count and pass-rate health bar', () => {
    render(
      <SuitesPanel
        suites={[{ id: 's1', name: 'Smoke — Release 4.2', caseCount: 12, passRate: 90 }]}
        totalCount={7}
        onSeeAll={vi.fn()}
        onSelectSuite={vi.fn()}
      />,
    )
    const row = screen.getByText('Smoke — Release 4.2').closest('li') as HTMLElement
    expect(within(row).getByText('12 cases')).toBeInTheDocument()
    expect(within(row).getByText('90%')).toBeInTheDocument()
    expect(screen.getByText(/see all 7/i)).toBeInTheDocument()
  })

  it('shows "Never run" instead of a fake 0% for a suite with no pass rate', () => {
    render(
      <SuitesPanel
        suites={[{ id: 's1', name: 'Onboarding Suite', caseCount: 0, passRate: null }]}
        totalCount={1}
        onSeeAll={vi.fn()}
        onSelectSuite={vi.fn()}
      />,
    )
    expect(screen.getByText(/never run/i)).toBeInTheDocument()
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
        suites={[{ id: 's1', name: 'Smoke — Release 4.2', caseCount: 12, passRate: 90 }]}
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
  it('shows recent runs with their pass rate and pass/fail fraction', () => {
    render(
      <RunsPanel
        runs={[
          { id: 'r1', name: 'Smoke — Release 4.2', createdAt: '2026-01-01T00:00:00Z', passRate: 92, passCount: 23, total: 25 },
        ]}
        totalCount={5}
        onSeeAll={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )
    const row = screen.getByText('Smoke — Release 4.2').closest('li') as HTMLElement
    expect(within(row).getByText('92%')).toBeInTheDocument()
    expect(within(row).getByText('23/25 passed')).toBeInTheDocument()
    expect(screen.getByText(/see all/i)).toBeInTheDocument()
  })

  it('navigates directly to a run when its row is clicked', async () => {
    const onSelectRun = vi.fn()
    render(
      <RunsPanel
        runs={[
          { id: 'r1', name: 'Smoke — Release 4.2', createdAt: '2026-01-01T00:00:00Z', passRate: 92, passCount: 23, total: 25 },
        ]}
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
          { id: 'r3', name: 'Mid health run', createdAt: '2026-01-01T00:00:00Z', passRate: 60, passCount: 6, total: 10 },
          { id: 'r4', name: 'Low health run', createdAt: '2026-01-01T00:00:00Z', passRate: 20, passCount: 2, total: 10 },
        ]}
        totalCount={2}
        onSeeAll={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    )
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
  })

  it('shows "not run yet" for a run with no recorded results yet', () => {
    render(
      <RunsPanel
        runs={[{ id: 'r2', name: 'Just created', createdAt: '2026-01-01T00:00:00Z', passRate: null, passCount: 0, total: 0 }]}
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
