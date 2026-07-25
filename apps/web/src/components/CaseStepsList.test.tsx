import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
