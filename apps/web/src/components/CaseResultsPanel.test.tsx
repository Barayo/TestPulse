import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

    it('never encodes verdict by color alone — every bar carries an accessible name and a legend backs it up', () => {
      render(<CaseResultsPanel data={data} />)
      const bars = screen.getAllByTestId('case-result-bar')
      expect(bars).toHaveLength(3)
      expect(bars[1]).toHaveAttribute('aria-label', expect.stringContaining('Failed'))
      // Legend: identity is never color-only.
      const legend = screen.getByRole('list', { name: 'Status breakdown' })
      expect(within(legend).getByText('Pass')).toBeInTheDocument()
      expect(within(legend).getByText('Failed')).toBeInTheDocument()
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

  describe('the full 6-status verdict vocabulary', () => {
    const data = {
      successRate: 40,
      lastRunAt: '20/07/2026',
      recent: [
        { verdict: 'pass' as const, date: '15 Jul' },
        { verdict: 'blocked' as const, date: '16 Jul' },
        { verdict: 'pending' as const, date: '17 Jul' },
        { verdict: 'retest' as const, date: '18 Jul' },
        { verdict: 'failed' as const, date: '19 Jul' },
      ],
    }

    it('renders a blocked execution with --chart-4', () => {
      render(<CaseResultsPanel data={data} />)
      const bars = screen.getAllByTestId('case-result-bar')
      expect(bars[1]).toHaveStyle({ background: 'var(--chart-4)' })
    })

    it('renders a pending execution with --chart-5', () => {
      render(<CaseResultsPanel data={data} />)
      const bars = screen.getAllByTestId('case-result-bar')
      expect(bars[2]).toHaveStyle({ background: 'var(--chart-5)' })
    })

    it('renders a retest execution with the same diagonal texture RunStatusBreakdown uses', () => {
      render(<CaseResultsPanel data={data} />)
      const bars = screen.getAllByTestId('case-result-bar')
      expect(bars[3].style.backgroundImage).toContain('repeating-linear-gradient')
    })
  })

  describe('keyboard accessibility', () => {
    const data = {
      successRate: 82,
      lastRunAt: '20/07/2026',
      recent: [
        { verdict: 'pass' as const, date: '18 Jul' },
        { verdict: 'failed' as const, date: '19 Jul' },
      ],
    }

    it('each result bar is a real button, reachable via Tab, with an accessible name carrying verdict and date', () => {
      render(<CaseResultsPanel data={data} />)
      const bars = screen.getAllByTestId('case-result-bar')
      for (const bar of bars) {
        expect(bar.tagName).toBe('BUTTON')
        expect(bar).toHaveAttribute('type', 'button')
      }
      expect(bars[1]).toHaveAccessibleName('Failed · 19 Jul')
    })
  })
})
