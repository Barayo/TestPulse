import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PropertyRow } from './PropertyRow'

describe('PropertyRow', () => {
  it('renders a label and value', () => {
    render(<PropertyRow label="Test type" value="E2E" />)
    expect(screen.getByText('Test type')).toBeInTheDocument()
    expect(screen.getByText('E2E')).toBeInTheDocument()
  })

  it('styles the label with the tp-label convention', () => {
    render(<PropertyRow label="Platform" value="web" />)
    expect(screen.getByText('Platform')).toHaveClass('tp-label')
  })

  it('shows a dash placeholder instead of blank space when the value is empty', () => {
    render(<PropertyRow label="Platform" value="" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a non-string value (e.g. a badge) as the value', () => {
    render(<PropertyRow label="Priority" value={<span data-testid="badge">Medium</span>} />)
    expect(screen.getByTestId('badge')).toBeInTheDocument()
  })
})
