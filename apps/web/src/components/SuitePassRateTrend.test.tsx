import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuitePassRateTrend, type TrendPoint } from './SuitePassRateTrend'

const points: TrendPoint[] = [
  { runKey: 'R1', runName: 'Nightly #1', createdAt: '2026-07-01T00:00:00Z', rate: 50, isOpen: false, detail: 'Nightly #1 · 50% (2/4 pass)' },
  { runKey: 'R2', runName: 'Nightly #2', createdAt: '2026-07-08T00:00:00Z', rate: 75, isOpen: false, detail: 'Nightly #2 · 75% (3/4 pass)' },
  { runKey: 'R3', runName: 'Nightly #3', createdAt: '2026-07-15T00:00:00Z', rate: 100, isOpen: false, detail: 'Nightly #3 · 100% (4/4 pass)' },
]

describe('SuitePassRateTrend', () => {
  it('renders one marker per point, as an HTML overlay element rather than an SVG circle', () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    const point = screen.getByTestId('suite-trend-point-R1')
    expect(point.closest('svg')).toBeNull()
  })

  it('positions each point by its own pass rate, not a shared average', () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    const first = screen.getByTestId('suite-trend-point-R1')
    const last = screen.getByTestId('suite-trend-point-R3')
    // R1 is 50%, R3 is 100% — R3's marker sits closer to the top (smaller top%)
    const firstTop = parseFloat(first.style.top)
    const lastTop = parseFloat(last.style.top)
    expect(lastTop).toBeLessThan(firstTop)
  })

  it("exposes each point's detail via an accessible name, not color alone", () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    const point = screen.getByTestId('suite-trend-point-R1')
    expect(point).toHaveAccessibleName(points[0].detail)
  })

  it('shows a tooltip with the point detail on hover, hiding it again on mouse leave', async () => {
    const user = userEvent.setup()
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    const point = screen.getByTestId('suite-trend-point-R1')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.hover(point)
    expect(screen.getByRole('tooltip')).toHaveTextContent(points[0].detail)
    await user.unhover(point)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows a tooltip with the point detail on keyboard focus, hiding it again on blur', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SuitePassRateTrend points={points} emptyMessage="No runs yet" />
        <button type="button">elsewhere</button>
      </>,
    )
    await user.tab() // focuses the first point (only interactive element before "elsewhere")
    expect(screen.getByRole('tooltip')).toHaveTextContent(points[0].detail)
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('always shows a percentage label on the endpoint, without hovering', () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-trend-endpoint-label')).toHaveTextContent('100%')
  })

  it('does not show an always-visible label on non-endpoint points', () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    // 50% would otherwise collide with the y-axis's own static "50%" label
    // (design.md D12) — scoped to non-endpoint rates that aren't also an
    // axis tick value.
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
  })

  it('uses the pass semantic color for the line, not a new hue', () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    const line = screen.getByTestId('suite-trend-line')
    expect(line).toHaveAttribute('stroke', 'var(--primary)')
  })

  it('centers a single point when the suite has only one run', () => {
    render(<SuitePassRateTrend points={[points[0]]} emptyMessage="No runs yet" />)
    const point = screen.getByTestId('suite-trend-point-R1')
    expect(parseFloat(point.style.left)).toBeCloseTo(50, 0)
  })

  it('visually emphasizes the most recent point over the others', () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    const endpoint = screen.getByTestId('suite-trend-point-R3')
    const earlier = screen.getByTestId('suite-trend-point-R1')
    const endpointSize = parseFloat(endpoint.style.width)
    const earlierSize = parseFloat(earlier.style.width)
    expect(endpointSize).toBeGreaterThan(earlierSize)
  })

  it('renders an open point with a distinct treatment from a closed point', () => {
    const withOpen: TrendPoint[] = [...points, { runKey: 'R4', runName: 'Nightly #4', createdAt: '2026-07-22T00:00:00Z', rate: 40, isOpen: true, detail: 'Nightly #4 · 40% so far (in progress)' }]
    render(<SuitePassRateTrend points={withOpen} emptyMessage="No runs yet" />)
    const openPoint = screen.getByTestId('suite-trend-point-R4')
    const closedPoint = screen.getByTestId('suite-trend-point-R1')
    expect(openPoint.getAttribute('data-open')).toBe('true')
    expect(closedPoint.getAttribute('data-open')).toBeNull()
  })

  it('renders a dashed line segment leading into an open endpoint', () => {
    const withOpenEndpoint: TrendPoint[] = [...points, { runKey: 'R4', runName: 'Nightly #4', createdAt: '2026-07-22T00:00:00Z', rate: 40, isOpen: true, detail: 'in progress' }]
    render(<SuitePassRateTrend points={withOpenEndpoint} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-trend-dash-segment')).toBeInTheDocument()
  })

  it('does not render a dashed segment when the endpoint is closed', () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    expect(screen.queryByTestId('suite-trend-dash-segment')).not.toBeInTheDocument()
  })

  it('treats a run with 0% as a real value on the endpoint label, not a division error', () => {
    render(<SuitePassRateTrend points={[{ runKey: 'R', runName: 'All failed', createdAt: '2026-07-01T00:00:00Z', rate: 0, isOpen: false, detail: 'All failed · 0%' }]} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-trend-endpoint-label')).toHaveTextContent('0%')
  })

  it('shows y-axis percentage labels at 0%, 50%, and 100%', () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-trend-axis-y-100')).toHaveTextContent('100%')
    expect(screen.getByTestId('suite-trend-axis-y-50')).toHaveTextContent('50%')
    expect(screen.getByTestId('suite-trend-axis-y-0')).toHaveTextContent('0%')
  })

  it('shows the oldest and newest run dates as x-axis range labels', () => {
    render(<SuitePassRateTrend points={points} emptyMessage="No runs yet" />)
    expect(screen.getByTestId('suite-trend-axis-x-start')).toHaveTextContent(new Date(points[0].createdAt).toLocaleDateString())
    expect(screen.getByTestId('suite-trend-axis-x-end')).toHaveTextContent(new Date(points[2].createdAt).toLocaleDateString())
  })

  it('does not show x-axis range labels for a single point (no real range to show)', () => {
    render(<SuitePassRateTrend points={[points[0]]} emptyMessage="No runs yet" />)
    expect(screen.queryByTestId('suite-trend-axis-x-start')).not.toBeInTheDocument()
    expect(screen.queryByTestId('suite-trend-axis-x-end')).not.toBeInTheDocument()
  })

  it('shows the caller-provided empty state instead of a broken zero-point chart', () => {
    render(<SuitePassRateTrend points={[]} emptyMessage="No closed runs yet — close one to see it here." />)
    expect(screen.getByText('No closed runs yet — close one to see it here.')).toBeInTheDocument()
    expect(screen.queryByTestId('suite-trend-line')).not.toBeInTheDocument()
  })
})
