import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunStatusBreakdown } from './RunStatusBreakdown'

describe('RunStatusBreakdown', () => {
  it('shows the overall pass rate', () => {
    render(<RunStatusBreakdown total={4} counts={{ pass: 3, failed: 1 }} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('renders one bar segment per present status, proportionally sized', () => {
    render(<RunStatusBreakdown total={4} counts={{ pass: 3, failed: 1 }} />)
    const pass = screen.getByTestId('run-status-segment-pass')
    const failed = screen.getByTestId('run-status-segment-failed')
    expect(pass).toHaveStyle({ width: '75%' })
    expect(failed).toHaveStyle({ width: '25%' })
  })

  it('does not render a segment for a status with zero items', () => {
    render(<RunStatusBreakdown total={4} counts={{ pass: 3, failed: 1 }} />)
    expect(screen.queryByTestId('run-status-segment-blocked')).not.toBeInTheDocument()
  })

  it('gives every status its own resolved chart color', () => {
    render(
      <RunStatusBreakdown
        total={6}
        counts={{ pass: 1, failed: 1, skipped: 1, blocked: 1, pending: 1, retest: 1 }}
      />,
    )
    expect(screen.getByTestId('run-status-segment-pass')).toHaveStyle({ background: 'var(--chart-1)' })
    expect(screen.getByTestId('run-status-segment-skipped')).toHaveStyle({ background: 'var(--chart-2)' })
    expect(screen.getByTestId('run-status-segment-failed')).toHaveStyle({ background: 'var(--chart-3)' })
    expect(screen.getByTestId('run-status-segment-blocked')).toHaveStyle({ background: 'var(--chart-4)' })
    expect(screen.getByTestId('run-status-segment-pending')).toHaveStyle({ background: 'var(--chart-5)' })
  })

  it('gives retest a texture, not a plain flat color, so it never needs a 6th hue', () => {
    render(<RunStatusBreakdown total={1} counts={{ retest: 1 }} />)
    const retest = screen.getByTestId('run-status-segment-retest')
    expect(retest.style.backgroundImage).toContain('repeating-linear-gradient')
  })

  it('shows a legend covering all six statuses, including those at zero', () => {
    render(<RunStatusBreakdown total={2} counts={{ pass: 2 }} />)
    const legend = screen.getByRole('list', { name: /status breakdown/i })
    for (const status of ['pending', 'pass', 'failed', 'skipped', 'blocked', 'retest']) {
      expect(screen.getByText(new RegExp(`^${status}$`, 'i'))).toBeInTheDocument()
    }
    expect(legend).toHaveTextContent('2')
  })

  it('shows full chrome instead of a blank strip when the run has no items yet', () => {
    render(<RunStatusBreakdown total={0} counts={{}} />)
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument()
  })
})
