import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuiteRunBreakdownTrend, type RunBreakdownPoint } from './SuiteRunBreakdownTrend'

const points: RunBreakdownPoint[] = [
  { runKey: 'R1', runName: 'Nightly #1', createdAt: '2026-07-01T00:00:00Z', total: 4, counts: { pass: 2, failed: 2 } },
  { runKey: 'R2', runName: 'Nightly #2', createdAt: '2026-07-08T00:00:00Z', total: 4, counts: { pass: 3, skipped: 1 } },
  { runKey: 'R3', runName: 'Nightly #3', createdAt: '2026-07-15T00:00:00Z', total: 4, counts: { pass: 4 } },
]

describe('SuiteRunBreakdownTrend', () => {
  it('renders one bar per point', () => {
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-breakdown-bar-R1')).toBeInTheDocument()
    expect(screen.getByTestId('suite-breakdown-bar-R2')).toBeInTheDocument()
    expect(screen.getByTestId('suite-breakdown-bar-R3')).toBeInTheDocument()
  })

  it("renders each non-zero status as its own segment sized to its share of the run's total", () => {
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    const bar = screen.getByTestId('suite-breakdown-bar-R1')
    const passSegment = screen.getByTestId('suite-breakdown-segment-R1-pass')
    const failedSegment = screen.getByTestId('suite-breakdown-segment-R1-failed')
    expect(bar).toContainElement(passSegment)
    expect(bar).toContainElement(failedSegment)
    expect(passSegment.style.height).toBe('50%')
    expect(failedSegment.style.height).toBe('50%')
  })

  it('does not render a segment for a status with zero items', () => {
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    expect(screen.queryByTestId('suite-breakdown-segment-R3-failed')).not.toBeInTheDocument()
  })

  it("exposes each bar's full breakdown via an accessible name, not color alone", () => {
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    const bar = screen.getByTestId('suite-breakdown-bar-R1')
    expect(bar).toHaveAccessibleName('Nightly #1 · 7/1/2026 · 50% (2/4 pass) — 2 failed')
  })

  it('shows a tooltip listing every non-zero status with its count and percentage on hover', async () => {
    const user = userEvent.setup()
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    const bar = screen.getByTestId('suite-breakdown-bar-R1')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.hover(bar)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Pass')
    expect(tooltip).toHaveTextContent('2')
    expect(tooltip).toHaveTextContent('Failed')
    await user.unhover(bar)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the tooltip on keyboard focus too', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />
        <button type="button">elsewhere</button>
      </>,
    )
    await user.tab()
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('always shows a pass-rate label on the endpoint bar, without hovering', () => {
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-breakdown-endpoint-label')).toHaveTextContent('100%')
  })

  it('visually emphasizes the most recent bar over the others', () => {
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    const endpoint = screen.getByTestId('suite-breakdown-bar-R3')
    const earlier = screen.getByTestId('suite-breakdown-bar-R1')
    expect(endpoint.getAttribute('data-endpoint')).toBe('true')
    expect(earlier.getAttribute('data-endpoint')).toBeNull()
  })

  it('renders an open bar at reduced visual weight, distinct from a closed one', () => {
    const withOpen: RunBreakdownPoint[] = [...points, { runKey: 'R4', runName: 'Nightly #4', createdAt: '2026-07-22T00:00:00Z', total: 5, counts: { pass: 3, failed: 1 }, isOpen: true }]
    render(<SuiteRunBreakdownTrend points={withOpen} emptyMessage="No runs yet" />)
    const openBar = screen.getByTestId('suite-breakdown-bar-R4')
    const closedBar = screen.getByTestId('suite-breakdown-bar-R1')
    expect(openBar.getAttribute('data-open')).toBe('true')
    expect(closedBar.getAttribute('data-open')).toBeNull()
    expect(parseFloat(openBar.style.opacity)).toBeLessThan(1)
  })

  it("states an open run's accessible name marks it as still in progress", () => {
    const withOpen: RunBreakdownPoint[] = [...points, { runKey: 'R4', runName: 'Nightly #4', createdAt: '2026-07-22T00:00:00Z', total: 5, counts: { pass: 3, failed: 1 }, isOpen: true }]
    render(<SuiteRunBreakdownTrend points={withOpen} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-breakdown-bar-R4')).toHaveAccessibleName(/still open|in progress/i)
  })

  it('keeps pending in the legend for parity with RunStatusBreakdown', () => {
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    const legend = screen.getByLabelText('Status breakdown')
    expect(legend).toHaveTextContent('Pending')
  })

  it('shows y-axis percentage labels at 0%, 50%, and 100%', () => {
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-breakdown-axis-y-100')).toHaveTextContent('100%')
    expect(screen.getByTestId('suite-breakdown-axis-y-50')).toHaveTextContent('50%')
    expect(screen.getByTestId('suite-breakdown-axis-y-0')).toHaveTextContent('0%')
  })

  it('shows the oldest and newest run dates as x-axis range labels', () => {
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-breakdown-axis-x-start')).toHaveTextContent(new Date(points[0].createdAt).toLocaleDateString())
    expect(screen.getByTestId('suite-breakdown-axis-x-end')).toHaveTextContent(new Date(points[2].createdAt).toLocaleDateString())
  })

  it('shows the caller-provided empty state instead of a broken zero-point chart', () => {
    render(<SuiteRunBreakdownTrend points={[]} emptyMessage="No closed runs yet — close one to see it here." />)
    expect(screen.getByText('No closed runs yet — close one to see it here.')).toBeInTheDocument()
    expect(screen.queryByTestId('suite-breakdown-bar-R1')).not.toBeInTheDocument()
  })

  it('keyboard tab order visits bars in chronological order', async () => {
    const user = userEvent.setup()
    render(<SuiteRunBreakdownTrend points={points} emptyMessage="No runs yet" />)
    await user.tab()
    expect(screen.getByTestId('suite-breakdown-bar-R1')).toHaveFocus()
    await user.tab()
    expect(screen.getByTestId('suite-breakdown-bar-R2')).toHaveFocus()
    await user.tab()
    expect(screen.getByTestId('suite-breakdown-bar-R3')).toHaveFocus()
  })
})
