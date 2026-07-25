import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SuitePassRateTrend } from './SuitePassRateTrend'
import type { components } from '@testpulse/shared/api'

type SuiteTrendPoint = components['schemas']['SuiteTrendPoint']

const points: SuiteTrendPoint[] = [
  { runKey: 'SAMPLE-R1', runName: 'Nightly #1', createdAt: '2026-07-01T00:00:00Z', total: 4, counts: { pass: 2, failed: 2 } },
  { runKey: 'SAMPLE-R2', runName: 'Nightly #2', createdAt: '2026-07-08T00:00:00Z', total: 4, counts: { pass: 3, failed: 1 } },
  { runKey: 'SAMPLE-R3', runName: 'Nightly #3', createdAt: '2026-07-15T00:00:00Z', total: 4, counts: { pass: 4 } },
]

describe('SuitePassRateTrend', () => {
  it('shows the latest run pass rate as the headline', () => {
    render(<SuitePassRateTrend points={points} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('shows the number of runs behind the headline', () => {
    render(<SuitePassRateTrend points={points} />)
    expect(screen.getByText(/3 runs/i)).toBeInTheDocument()
  })

  it('renders one point per closed run, oldest first', () => {
    render(<SuitePassRateTrend points={points} />)
    expect(screen.getByTestId('suite-trend-point-SAMPLE-R1')).toBeInTheDocument()
    expect(screen.getByTestId('suite-trend-point-SAMPLE-R2')).toBeInTheDocument()
    expect(screen.getByTestId('suite-trend-point-SAMPLE-R3')).toBeInTheDocument()
  })

  it('positions each point by its own pass rate, not a shared average', () => {
    render(<SuitePassRateTrend points={points} />)
    const first = screen.getByTestId('suite-trend-point-SAMPLE-R1')
    const last = screen.getByTestId('suite-trend-point-SAMPLE-R3')
    // R1 is 50% pass, R3 is 100% — R3's marker sits higher (smaller cy) in SVG space
    const firstCy = Number(first.getAttribute('cy'))
    const lastCy = Number(last.getAttribute('cy'))
    expect(lastCy).toBeLessThan(firstCy)
  })

  it('exposes each point\'s run name and breakdown via an accessible title, not color alone', () => {
    render(<SuitePassRateTrend points={points} />)
    const point = screen.getByTestId('suite-trend-point-SAMPLE-R1')
    expect(point.textContent ?? point.querySelector('title')?.textContent).toMatch(/Nightly #1/)
  })

  it('uses the pass semantic color for the line, not a new hue', () => {
    render(<SuitePassRateTrend points={points} />)
    const line = screen.getByTestId('suite-trend-line')
    expect(line).toHaveAttribute('stroke', 'var(--primary)')
  })

  it('centers a single point when the suite has only one closed run', () => {
    render(<SuitePassRateTrend points={[points[0]]} />)
    const point = screen.getByTestId('suite-trend-point-SAMPLE-R1')
    expect(Number(point.getAttribute('cx'))).toBeCloseTo(50, 0)
  })

  it('treats a run with no passes at all as 0%, not a division error', () => {
    render(<SuitePassRateTrend points={[{ runKey: 'R', runName: 'All failed', createdAt: '2026-07-01T00:00:00Z', total: 3, counts: { failed: 3 } }]} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('shows an explicit empty state instead of a broken zero-point chart', () => {
    render(<SuitePassRateTrend points={[]} />)
    expect(screen.getByText(/no closed runs yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId('suite-trend-line')).not.toBeInTheDocument()
  })
})
