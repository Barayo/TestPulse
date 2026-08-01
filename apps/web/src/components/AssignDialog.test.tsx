import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssignDialog } from './AssignDialog'

describe('AssignDialog', () => {
  it('renders a text field and lists suggestions as datalist options', () => {
    render(<AssignDialog open onOpenChange={() => {}} suggestions={['ana', 'luis']} onAssign={() => {}} />)

    const field = screen.getByLabelText(/^name$/i)
    expect(field).toBeInTheDocument()
    const optionValues = Array.from(document.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))
    expect(optionValues).toEqual(['ana', 'luis'])
  })

  it('is prefilled with the current assignee when provided', () => {
    render(
      <AssignDialog open onOpenChange={() => {}} currentAssignee="ana" suggestions={[]} onAssign={() => {}} />,
    )

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('ana')
  })

  it('calls onAssign with the entered value on submit', async () => {
    const onAssign = vi.fn()
    render(<AssignDialog open onOpenChange={() => {}} suggestions={[]} onAssign={onAssign} />)

    await userEvent.type(screen.getByLabelText(/^name$/i), 'ana')
    await userEvent.click(screen.getByRole('button', { name: /^assign$/i }))

    expect(onAssign).toHaveBeenCalledWith('ana')
  })
})
