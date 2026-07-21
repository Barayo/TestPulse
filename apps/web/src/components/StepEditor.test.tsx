import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepEditor, type Step } from './StepEditor'

function StatefulStepEditor() {
  const [steps, setSteps] = useState<Step[]>([{ action: '', expected: '' }])
  return <StepEditor steps={steps} onChange={setSteps} />
}

describe('StepEditor', () => {
  it('renders action and expected result as multiline textareas, not single-line inputs', () => {
    render(<StepEditor steps={[{ action: '', expected: '' }]} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/^action for step 1/i).tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText(/^expected result for step 1/i).tagName).toBe('TEXTAREA')
  })

  it('lets a user type a long, wrapping action without losing any of it', async () => {
    render(<StatefulStepEditor />)
    const long =
      'Attempt the same role-management calls as a non-Tenant-Admin user across every endpoint in the surface'
    await userEvent.type(screen.getByLabelText(/^action for step 1/i), long)
    expect(screen.getByLabelText(/^action for step 1/i)).toHaveValue(long)
  })
})
