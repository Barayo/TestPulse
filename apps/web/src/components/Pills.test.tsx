import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AutomationPill, ClassificationPills, StalePill, tagPills } from './Pills'

describe('ClassificationPills', () => {
  it('renders a pill for priority, platform, and test type when present', () => {
    render(<ClassificationPills priority="high" platform="web" testType="e2e" />)
    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('web')).toBeInTheDocument()
    expect(screen.getByText('e2e')).toBeInTheDocument()
  })

  it('omits a pill for any field left empty', () => {
    render(<ClassificationPills priority="" platform="web" testType="" />)
    expect(screen.queryByText('e2e')).not.toBeInTheDocument()
    expect(screen.getByText('web')).toBeInTheDocument()
  })
})

describe('AutomationPill', () => {
  it('shows "Auto" when automated is true', () => {
    render(<AutomationPill automated />)
    expect(screen.getByText('Auto')).toBeInTheDocument()
  })

  it('shows "Manual" when automated is false', () => {
    render(<AutomationPill automated={false} />)
    expect(screen.getByText('Manual')).toBeInTheDocument()
  })
})

describe('StalePill', () => {
  it('renders a "Stale" label', () => {
    render(<StalePill />)
    expect(screen.getByText('Stale')).toBeInTheDocument()
  })
})

describe('tagPills', () => {
  it('caps tags at 2 with an overflow badge', () => {
    render(<>{tagPills(['a', 'b', 'c', 'd'])}</>)
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.queryByText('c')).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders nothing extra when there are 2 or fewer tags', () => {
    render(<>{tagPills(['a', 'b'])}</>)
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })
})
