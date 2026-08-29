import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CaseContentView } from './CaseContentView'

describe('CaseContentView', () => {
  it('renders a steps list for format: steps', () => {
    render(
      <CaseContentView
        content={{ format: 'steps', steps: [{ action: 'Open login page', expected: 'Form visible' }], description: '', gherkinSource: '' }}
      />,
    )
    expect(screen.getByText('Open login page')).toBeInTheDocument()
  })

  it('renders the description for format: text', () => {
    render(
      <CaseContentView content={{ format: 'text', steps: [], description: 'Walk through checkout.', gherkinSource: '' }} />,
    )
    expect(screen.getByText('Walk through checkout.')).toBeInTheDocument()
  })

  it('shows an empty state for format: text with no description', () => {
    render(<CaseContentView content={{ format: 'text', steps: [], description: '', gherkinSource: '' }} />)
    expect(screen.getByText(/no description yet/i)).toBeInTheDocument()
  })

  it('renders the gherkin source for format: gherkin', () => {
    render(
      <CaseContentView
        content={{ format: 'gherkin', steps: [], description: '', gherkinSource: 'Given a user\nWhen they log in' }}
      />,
    )
    expect(screen.getByText('Given')).toBeInTheDocument()
    expect(screen.getByText('When')).toBeInTheDocument()
  })

  it('shows an empty state for format: gherkin with no source', () => {
    render(<CaseContentView content={{ format: 'gherkin', steps: [], description: '', gherkinSource: '' }} />)
    expect(screen.getByText(/no scenario yet/i)).toBeInTheDocument()
  })

  it('defaults to steps rendering when format is unset', () => {
    render(
      <CaseContentView content={{ format: undefined, steps: [{ action: 'Do the thing', expected: '' }], description: '', gherkinSource: '' }} />,
    )
    expect(screen.getByText('Do the thing')).toBeInTheDocument()
  })
})
