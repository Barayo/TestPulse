import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaseStepsList } from './CaseStepsList'

describe('CaseStepsList', () => {
  it('renders a numbered badge and action text per step', () => {
    render(
      <CaseStepsList
        steps={[
          { action: 'open login page', expected: 'form visible' },
          { action: 'submit credentials' },
        ]}
      />,
    )
    expect(screen.getByTestId('step-number-0')).toHaveTextContent('1')
    expect(screen.getByTestId('step-number-1')).toHaveTextContent('2')
    expect(screen.getByText('open login page')).toBeInTheDocument()
    expect(screen.getByText('submit credentials')).toBeInTheDocument()
  })

  it('renders a per-step expected-result callout when present', () => {
    render(<CaseStepsList steps={[{ action: 'open login page', expected: 'form visible' }]} />)
    expect(screen.getByText('Expected:')).toBeInTheDocument()
    expect(screen.getByText('form visible')).toBeInTheDocument()
  })

  it('does not render a callout for a step with no expected result', () => {
    render(<CaseStepsList steps={[{ action: 'just do it' }]} />)
    expect(screen.queryByText('Expected:')).not.toBeInTheDocument()
  })

  it('shows a real empty state, not a bare sentence, when there are no steps', () => {
    render(<CaseStepsList steps={[]} />)
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument()
    expect(screen.getByText(/add steps to describe how to run this test/i)).toBeInTheDocument()
  })

  it('treats undefined steps the same as an empty list', () => {
    render(<CaseStepsList steps={undefined} />)
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument()
  })

  it('does not render any call-to-action in the empty state by default', () => {
    render(<CaseStepsList steps={[]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders a provided emptyStateAction inside the empty state', () => {
    render(<CaseStepsList steps={[]} emptyStateAction={<button>+ Add steps</button>} />)
    expect(screen.getByRole('button', { name: '+ Add steps' })).toBeInTheDocument()
  })
})

describe('CaseStepsList — editable (in-place edit, add-case-authoring-formats)', () => {
  it('renders editable action/expected fields inside the same card shape as read mode, when onChange is provided', () => {
    render(
      <CaseStepsList
        steps={[{ action: 'open login page', expected: 'form visible' }]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('step-number-0')).toHaveTextContent('1')
    expect(screen.getByLabelText(/^action for step 1/i)).toHaveValue('open login page')
    expect(screen.getByLabelText(/^expected result for step 1/i)).toHaveValue('form visible')
  })

  it('reports an edited action via onChange', async () => {
    const onChange = vi.fn()
    render(<CaseStepsList steps={[{ action: 'open login page', expected: '' }]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText(/^action for step 1/i), '!')
    expect(onChange).toHaveBeenCalledWith([{ action: 'open login page!', expected: '' }])
  })

  it('removes a step via its remove control', async () => {
    const onChange = vi.fn()
    render(
      <CaseStepsList
        steps={[
          { action: 'first', expected: '' },
          { action: 'second', expected: '' },
        ]}
        onChange={onChange}
      />,
    )
    await userEvent.click(screen.getByLabelText(/remove step 1/i))
    expect(onChange).toHaveBeenCalledWith([{ action: 'second', expected: '' }])
  })

  it('adds a step via an in-card "+ Add step" control', async () => {
    const onChange = vi.fn()
    render(<CaseStepsList steps={[{ action: 'first', expected: '' }]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /add step/i }))
    expect(onChange).toHaveBeenCalledWith([
      { action: 'first', expected: '' },
      { action: '', expected: '' },
    ])
  })

  it('renders the card (with an Add step control) rather than the empty state when editable with zero steps', () => {
    render(<CaseStepsList steps={[]} onChange={vi.fn()} />)
    expect(screen.queryByText(/no steps yet/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add step/i })).toBeInTheDocument()
  })
})
