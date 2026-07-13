import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it.each([
    ['pending', 'pending'],
    ['pass', 'pass'],
    ['failed', 'failed'],
    ['skipped', 'skipped'],
    ['blocked', 'blocked'],
    ['retest', 'retest'],
  ] as const)('renders the %s status with its label', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('gives pass and failed visually distinct dot colors', () => {
    const { container: passContainer } = render(<StatusBadge status="pass" />)
    const { container: failContainer } = render(<StatusBadge status="failed" />)
    const passDot = passContainer.querySelector('[data-dot]')
    const failDot = failContainer.querySelector('[data-dot]')
    expect(passDot).not.toBeNull()
    expect(failDot).not.toBeNull()
    expect(passDot?.className).not.toBe(failDot?.className)
  })

  it('gives skipped its own warn-toned color, distinct from the neutral pending/retest dot', () => {
    const { container: skippedContainer } = render(<StatusBadge status="skipped" />)
    const { container: pendingContainer } = render(<StatusBadge status="pending" />)
    const skippedDot = skippedContainer.querySelector('[data-dot]')
    const pendingDot = pendingContainer.querySelector('[data-dot]')
    expect(skippedDot?.className).not.toBe(pendingDot?.className)
  })
})
