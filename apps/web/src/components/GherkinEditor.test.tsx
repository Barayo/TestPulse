import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GherkinEditor, GherkinView } from './GherkinEditor'

describe('GherkinEditor', () => {
  it('renders a labeled textarea with Given/When/Then guidance', () => {
    render(<GherkinEditor value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText(/scenario/i)).toBeInTheDocument()
    expect(screen.getByText(/given, when, then, and, or but/i)).toBeInTheDocument()
  })

  it('reports edits via onChange', async () => {
    const onChange = vi.fn()
    render(<GherkinEditor value="" onChange={onChange} />)
    await userEvent.type(screen.getByLabelText(/scenario/i), 'Given a user')
    expect(onChange).toHaveBeenCalled()
  })

  it('is a controlled field that reflects its value prop', () => {
    render(<GherkinEditor value="Given a user" onChange={vi.fn()} />)
    expect(screen.getByLabelText(/scenario/i)).toHaveValue('Given a user')
  })
})

describe('GherkinView', () => {
  it('renders each line and bolds the leading keyword', () => {
    render(<GherkinView source={'Given a user\nWhen they log in'} />)
    expect(screen.getByText('Given')).toBeInTheDocument()
    expect(screen.getByText('When')).toBeInTheDocument()
  })
})
