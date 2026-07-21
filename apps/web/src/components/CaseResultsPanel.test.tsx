import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CaseResultsPanel } from './CaseResultsPanel'

describe('CaseResultsPanel', () => {
  it('renders a one-line explanation that no result history exists yet', () => {
    render(<CaseResultsPanel />)
    expect(screen.getByText(/no result history yet/i)).toBeInTheDocument()
  })

  it('renders placeholder chart chrome', () => {
    render(<CaseResultsPanel />)
    expect(screen.getByTestId('case-results-placeholder-chart')).toBeInTheDocument()
  })

  it('does not render its own section title — the hosting CaseSidebarSection owns that', () => {
    render(<CaseResultsPanel />)
    expect(screen.queryByText('Results')).not.toBeInTheDocument()
  })

  describe('with data', () => {
    const data = {
      successRate: 82,
      lastRunAt: '20/07/2026',
      recent: [
        { verdict: 'pass' as const, date: '18 Jul' },
        { verdict: 'failed' as const, date: '19 Jul' },
        { verdict: 'pass' as const, date: '20 Jul' },
      ],
    }

    it('renders the success rate as the headline number, not buried in the chart', () => {
      render(<CaseResultsPanel data={data} />)
      expect(screen.getByText('82%')).toBeInTheDocument()
    })

    it('never encodes verdict by color alone — every bar carries a text tooltip and a legend backs it up', () => {
      render(<CaseResultsPanel data={data} />)
      const bars = screen.getAllByTestId('case-result-bar')
      expect(bars).toHaveLength(3)
      expect(bars[1]).toHaveAttribute('title', expect.stringContaining('Fail'))
      // Legend: identity is never color-only.
      expect(screen.getByText('Pass')).toBeInTheDocument()
      expect(screen.getByText('Fail')).toBeInTheDocument()
    })

    it('shows the last-run date', () => {
      render(<CaseResultsPanel data={data} />)
      expect(screen.getByText(/20\/07\/2026/)).toBeInTheDocument()
    })

    it('does not fall back to the empty state when data is present', () => {
      render(<CaseResultsPanel data={data} />)
      expect(screen.queryByText(/no result history yet/i)).not.toBeInTheDocument()
    })
  })
})
