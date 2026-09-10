import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepSnapshotSummary } from './StepSnapshotSummary'

describe('StepSnapshotSummary', () => {
  it('renders nothing when no steps were marked', () => {
    const { container } = render(<StepSnapshotSummary stepResults={[]} totalSteps={5} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('summarizes marked count and failed count, collapsed by default', () => {
    render(
      <StepSnapshotSummary
        stepResults={[
          { stepIndex: 0, verdict: 'pass' },
          { stepIndex: 1, verdict: 'failed' },
          { stepIndex: 2, verdict: 'pass' },
        ]}
        totalSteps={5}
      />,
    )
    expect(screen.getByText('3/5 steps marked · 1 failed')).toBeInTheDocument()
    expect(screen.getByText('Step 1')).not.toBeVisible()
  })

  it('does not mention failed/blocked counts when neither occurred', () => {
    render(<StepSnapshotSummary stepResults={[{ stepIndex: 0, verdict: 'pass' }]} totalSteps={2} />)
    expect(screen.getByText('1/2 steps marked')).toBeInTheDocument()
  })

  it('mentions both failed and blocked counts when both occurred', () => {
    render(
      <StepSnapshotSummary
        stepResults={[
          { stepIndex: 0, verdict: 'failed' },
          { stepIndex: 1, verdict: 'blocked' },
        ]}
        totalSteps={2}
      />,
    )
    expect(screen.getByText('2/2 steps marked · 1 failed · 1 blocked')).toBeInTheDocument()
  })

  it('expands to show every step, marked ones with their verdict and unmarked ones with a dash', async () => {
    render(
      <StepSnapshotSummary
        stepResults={[
          { stepIndex: 0, verdict: 'pass' },
          { stepIndex: 2, verdict: 'failed' },
        ]}
        totalSteps={3}
      />,
    )
    await userEvent.click(screen.getByText(/steps marked/i))
    expect(screen.getByText('Step 1')).toBeInTheDocument()
    expect(screen.getByText('pass')).toBeInTheDocument()
    expect(screen.getByText('Step 2')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Step 3')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })
})
