import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaseParametersEditor } from './CaseParametersEditor'
import type { components } from '@testpulse/shared/api'

type CaseParameters = components['schemas']['CaseParameters']
type Step = components['schemas']['Step']

const twoColumnTwoRow: CaseParameters = {
  columns: ['Name', 'username'],
  rows: [
    { Name: 'valid', username: 'admin@example.com' },
    { Name: 'invalid', username: 'nobody@example.com' },
  ],
}

describe('CaseParametersEditor', () => {
  it('shows a quiet empty state with no parameters', () => {
    render(<CaseParametersEditor parameters={undefined} steps={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Test Data')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add test data' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the empty state when parameters have zero rows', () => {
    render(<CaseParametersEditor parameters={{ columns: ['Name'], rows: [] }} steps={[]} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '+ Add test data' })).toBeInTheDocument()
  })

  it('initializes a one-row table when the empty state action is clicked', async () => {
    const onChange = vi.fn()
    render(<CaseParametersEditor parameters={undefined} steps={[]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add test data' }))
    expect(onChange).toHaveBeenCalledWith({ columns: ['Name'], rows: [{ Name: '' }] })
  })

  it('renders a table with a header per column and a row per data row', () => {
    render(<CaseParametersEditor parameters={twoColumnTwoRow} steps={[]} onChange={vi.fn()} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByLabelText('Name column')).toHaveValue('Name')
    expect(screen.getByLabelText('Column 1')).toHaveValue('username')
    expect(screen.getByLabelText('Row 1 name')).toHaveValue('valid')
    expect(screen.getByLabelText('Row 2 name')).toHaveValue('invalid')
    expect(screen.getByLabelText('Row 1 username')).toHaveValue('admin@example.com')
  })

  it('the Name column has no remove control', () => {
    render(<CaseParametersEditor parameters={twoColumnTwoRow} steps={[]} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Remove column Name' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove column username' })).toBeInTheDocument()
  })

  it('adds a new blank column across every row', async () => {
    const onChange = vi.fn()
    render(<CaseParametersEditor parameters={twoColumnTwoRow} steps={[]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add column' }))
    expect(onChange).toHaveBeenCalledWith({
      columns: ['Name', 'username', 'column2'],
      rows: [
        { Name: 'valid', username: 'admin@example.com', column2: '' },
        { Name: 'invalid', username: 'nobody@example.com', column2: '' },
      ],
    })
  })

  it('removes a column not referenced by any step, from columns and every row', async () => {
    const onChange = vi.fn()
    render(<CaseParametersEditor parameters={twoColumnTwoRow} steps={[]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove column username' }))
    expect(onChange).toHaveBeenCalledWith({
      columns: ['Name'],
      rows: [{ Name: 'valid' }, { Name: 'invalid' }],
    })
  })

  it('blocks removing a column referenced by a step placeholder, with an inline message', async () => {
    const onChange = vi.fn()
    const steps: Step[] = [{ action: 'Enter {username}', expected: '' }]
    render(<CaseParametersEditor parameters={twoColumnTwoRow} steps={steps} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove column username' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/"username" is used in a step and can't be removed/i)).toBeInTheDocument()
  })

  it('renames a column, updating columns and every row key while preserving order', async () => {
    const onChange = vi.fn()
    render(<CaseParametersEditor parameters={twoColumnTwoRow} steps={[]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Column 1'), '!')
    expect(onChange).toHaveBeenCalledWith({
      columns: ['Name', 'username!'],
      rows: [
        { Name: 'valid', 'username!': 'admin@example.com' },
        { Name: 'invalid', 'username!': 'nobody@example.com' },
      ],
    })
  })

  it('blocks renaming a column to a name that already exists, with an inline message', async () => {
    const onChange = vi.fn()
    // 'usernam' is one keystroke away from colliding with the existing
    // 'username' column — typing the missing 'e' completes the collision
    // in a single keystroke, matching this file's append-one-char idiom.
    const threeColumn: CaseParameters = {
      columns: ['Name', 'usernam', 'username'],
      rows: [{ Name: 'valid', usernam: 'a@example.com', username: 'other@example.com' }],
    }
    render(<CaseParametersEditor parameters={threeColumn} steps={[]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Column 1'), 'e')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/"username" is already a column name/i)).toBeInTheDocument()
  })

  it('blocks renaming a column to "Name"', async () => {
    const onChange = vi.fn()
    const twoColumn: CaseParameters = {
      columns: ['Name', 'Nam'],
      rows: [{ Name: 'valid', Nam: 'x' }],
    }
    render(<CaseParametersEditor parameters={twoColumn} steps={[]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Column 1'), 'e')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/"Name" is already a column name/i)).toBeInTheDocument()
  })

  it('accepts every keystroke when renaming a column in one continuous type — regression: the header must not remount mid-edit', async () => {
    function Harness() {
      const [params, setParams] = useState<CaseParameters | undefined>(twoColumnTwoRow)
      return <CaseParametersEditor parameters={params} steps={[]} onChange={setParams} />
    }
    render(<Harness />)
    const input = screen.getByLabelText('Column 1')
    await userEvent.type(input, 'xyz')
    expect(screen.getByLabelText('Column 1')).toHaveValue('usernamexyz')
  })

  it('adds a new row keyed by every current column', async () => {
    const onChange = vi.fn()
    render(<CaseParametersEditor parameters={twoColumnTwoRow} steps={[]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add row' }))
    expect(onChange).toHaveBeenCalledWith({
      columns: ['Name', 'username'],
      rows: [...twoColumnTwoRow.rows, { Name: '', username: '' }],
    })
  })

  it('removes a row', async () => {
    const onChange = vi.fn()
    render(<CaseParametersEditor parameters={twoColumnTwoRow} steps={[]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove row 1' }))
    expect(onChange).toHaveBeenCalledWith({
      columns: ['Name', 'username'],
      rows: [twoColumnTwoRow.rows[1]],
    })
  })

  it('edits a cell inline', async () => {
    const onChange = vi.fn()
    render(<CaseParametersEditor parameters={twoColumnTwoRow} steps={[]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Row 1 username'), '!')
    expect(onChange).toHaveBeenCalledWith({
      columns: ['Name', 'username'],
      rows: [
        { Name: 'valid', username: 'admin@example.com!' },
        { Name: 'invalid', username: 'nobody@example.com' },
      ],
    })
  })
})
