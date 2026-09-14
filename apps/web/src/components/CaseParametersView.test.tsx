import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CaseParametersView } from './CaseParametersView'
import type { components } from '@testpulse/shared/api'

type CaseParameters = components['schemas']['CaseParameters']

const parameters: CaseParameters = {
  columns: ['Name', 'username'],
  rows: [
    { Name: 'valid', username: 'admin@example.com' },
    { Name: 'invalid', username: 'nobody@example.com' },
  ],
}

describe('CaseParametersView', () => {
  it('renders a read-only table of the parameter columns and rows', () => {
    render(<CaseParametersView parameters={parameters} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Test Data')).toBeInTheDocument()
    expect(screen.getByText('username')).toBeInTheDocument()
    expect(screen.getByText('valid')).toBeInTheDocument()
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('invalid')).toBeInTheDocument()
    expect(screen.getByText('nobody@example.com')).toBeInTheDocument()
  })

  it('renders no editable inputs — read-only', () => {
    render(<CaseParametersView parameters={parameters} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
