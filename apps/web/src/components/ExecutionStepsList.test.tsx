import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExecutionStepsList } from './ExecutionStepsList'

const steps = [
  { action: 'Navigate to login', expected: 'Form visible' },
  { action: 'Enter credentials' },
  { action: 'Submit' },
]

describe('ExecutionStepsList', () => {
  it('renders every step with its action and expected result', () => {
    render(<ExecutionStepsList steps={steps} stepStates={[]} onMark={vi.fn()} />)
    expect(screen.getByText('Navigate to login')).toBeInTheDocument()
    expect(screen.getByText(/form visible/i)).toBeInTheDocument()
    expect(screen.getByText('Enter credentials')).toBeInTheDocument()
    expect(screen.getByText('Submit')).toBeInTheDocument()
  })

  it('shows all four verdict letters, unmarked, for a step with no current state', () => {
    render(<ExecutionStepsList steps={steps} stepStates={[]} onMark={vi.fn()} />)
    const group = screen.getByRole('group', { name: /mark step 1 result/i })
    for (const label of ['Pass', 'Fail', 'Blocked', 'Skipped']) {
      const btn = within(group).getByRole('button', { name: new RegExp(`mark step 1 as ${label}`, 'i') })
      expect(btn).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('marks the currently-active verdict as pressed', () => {
    render(<ExecutionStepsList steps={steps} stepStates={[{ stepIndex: 1, verdict: 'failed' }]} onMark={vi.fn()} />)
    const group = screen.getByRole('group', { name: /mark step 2 result/i })
    expect(within(group).getByRole('button', { name: /mark step 2 as fail/i })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: /mark step 2 as pass/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onMark with the step index and verdict when a letter is clicked', async () => {
    const onMark = vi.fn()
    render(<ExecutionStepsList steps={steps} stepStates={[]} onMark={onMark} />)
    const group = screen.getByRole('group', { name: /mark step 3 result/i })
    await userEvent.click(within(group).getByRole('button', { name: /mark step 3 as blocked/i }))
    expect(onMark).toHaveBeenCalledWith(2, 'blocked')
  })

  it('does not render the verdict control for a step with no discrete steps', () => {
    render(<ExecutionStepsList steps={[]} stepStates={[]} onMark={vi.fn()} />)
    expect(screen.queryByRole('group', { name: /mark step/i })).not.toBeInTheDocument()
  })
})
