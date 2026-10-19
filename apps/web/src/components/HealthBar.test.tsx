import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  HealthBar,
  healthLabel,
  StatusPill,
  ProgressBar,
  HealthRing,
  statusDotClass,
  statusBorderClass,
  statusTextClass,
} from './HealthBar'

describe('HealthBar', () => {
  it('renders the rate as a percentage label', () => {
    render(<HealthBar rate={84} />)
    expect(screen.getByText('84%')).toBeInTheDocument()
  })

  it('fills teal at or above 80%', () => {
    render(<HealthBar rate={80} />)
    expect(document.querySelector('[data-fill]')).toHaveClass('bg-primary')
  })

  it('fills amber between 50% and 79%', () => {
    render(<HealthBar rate={50} />)
    expect(document.querySelector('[data-fill]')).toHaveClass('bg-secondary')
  })

  it('fills coral below 50%', () => {
    render(<HealthBar rate={49} />)
    expect(document.querySelector('[data-fill]')).toHaveClass('bg-destructive')
  })

  it('sets the fill width from the rate', () => {
    render(<HealthBar rate={37} />)
    expect(document.querySelector('[data-fill]')).toHaveStyle({ width: '37%' })
  })

  it('still shows a visible sliver of color at 0% rather than an invisible bar', () => {
    render(<HealthBar rate={0} />)
    const fill = document.querySelector('[data-fill]')
    expect(fill).toHaveClass('bg-destructive')
    expect(fill).not.toHaveStyle({ width: '0%' })
  })
})

describe('healthLabel', () => {
  it('labels rates at or above 80% as Healthy', () => {
    expect(healthLabel(84)).toBe('Healthy')
    expect(healthLabel(80)).toBe('Healthy')
  })

  it('labels rates between 50% and 79% as In progress', () => {
    expect(healthLabel(79)).toBe('In progress')
    expect(healthLabel(50)).toBe('In progress')
  })

  it('labels rates below 50% as At risk', () => {
    expect(healthLabel(49)).toBe('At risk')
    expect(healthLabel(0)).toBe('At risk')
  })
})

describe('StatusPill', () => {
  it('renders the healthy band with its tint classes', () => {
    render(<StatusPill rate={84} />)
    const pill = screen.getByText('Healthy')
    expect(pill).toHaveClass('bg-status-healthy-bg', 'text-status-healthy-fg')
  })

  it('renders the in-progress band with its tint classes', () => {
    render(<StatusPill rate={60} />)
    const pill = screen.getByText('In progress')
    expect(pill).toHaveClass('bg-status-progress-bg', 'text-status-progress-fg')
  })

  it('renders the at-risk band with its tint classes', () => {
    render(<StatusPill rate={30} />)
    const pill = screen.getByText('At risk')
    expect(pill).toHaveClass('bg-status-risk-bg', 'text-status-risk-fg')
  })

  it('renders "No runs yet" in the neutral tint when rate is null', () => {
    render(<StatusPill rate={null} />)
    const pill = screen.getByText('No runs yet')
    expect(pill).toHaveClass('bg-status-neutral-bg', 'text-status-neutral-fg')
  })

  it('omits the leading dot by default, matching ProjectsPage cards\' approved word-only mockup', () => {
    const { container } = render(<StatusPill rate={84} />)
    expect(container.querySelector('[data-dot]')).toBeNull()
  })

  it('shows a leading dot when dot is requested, matching the project landing summary strip\'s mockup', () => {
    const { container } = render(<StatusPill rate={84} dot />)
    expect(container.querySelector('[data-dot]')).not.toBeNull()
  })
})

describe('ProgressBar', () => {
  it('fills the bar by rate, without a percentage label', () => {
    render(<ProgressBar rate={37} />)
    const fill = document.querySelector('[data-fill]')
    expect(fill).toHaveStyle({ width: '37%' })
    expect(screen.queryByText('37%')).not.toBeInTheDocument()
  })

  it('colors the fill by the same bands as HealthBar', () => {
    render(<ProgressBar rate={84} />)
    expect(document.querySelector('[data-fill]')).toHaveClass('bg-primary')
  })

  it('renders an empty dashed track when rate is null, with no fill', () => {
    render(<ProgressBar rate={null} />)
    expect(document.querySelector('[data-fill]')).not.toBeInTheDocument()
    expect(document.querySelector('[data-track]')).toHaveClass('border-dashed')
  })
})

describe('HealthRing', () => {
  it('defaults to size-11 (44px) when size is omitted, matching ProjectPage\'s existing call site', () => {
    render(<HealthRing rate={84} />)
    expect(screen.getByTestId('health-ring')).toHaveClass('size-11')
  })

  it('renders at a custom pixel size when requested (redesign-runs-list-triage-view)', () => {
    render(<HealthRing rate={25} size={128} />)
    expect(screen.getByTestId('health-ring')).toHaveStyle({ width: '128px', height: '128px' })
  })

  it('colors the headline percentage by the same status band as the ring fill, not flat foreground (visual-elevation-redesign)', () => {
    render(<HealthRing rate={90} />)
    expect(screen.getByText('90%')).toHaveClass('text-status-healthy-fg')
  })

  it('colors a risk-band headline percentage with the risk token', () => {
    render(<HealthRing rate={10} />)
    expect(screen.getByText('10%')).toHaveClass('text-status-risk-fg')
  })
})

describe('statusDotClass', () => {
  it('matches the same bands as ProgressBar/StatusPill', () => {
    expect(statusDotClass(84)).toBe('bg-primary')
    expect(statusDotClass(60)).toBe('bg-secondary')
    expect(statusDotClass(30)).toBe('bg-destructive')
    expect(statusDotClass(null)).toBe('bg-muted-foreground/40')
  })
})

describe('statusBorderClass', () => {
  it('matches the same bands as StatusPill', () => {
    expect(statusBorderClass(84)).toBe('border-l-primary')
    expect(statusBorderClass(60)).toBe('border-l-secondary')
    expect(statusBorderClass(30)).toBe('border-l-destructive')
    expect(statusBorderClass(null)).toBe('border-l-border')
  })
})

describe('statusTextClass', () => {
  it('matches the same tint tokens as StatusPill, as a text color', () => {
    expect(statusTextClass(84)).toBe('text-status-healthy-fg')
    expect(statusTextClass(60)).toBe('text-status-progress-fg')
    expect(statusTextClass(30)).toBe('text-status-risk-fg')
    expect(statusTextClass(null)).toBe('text-status-neutral-fg')
  })
})
