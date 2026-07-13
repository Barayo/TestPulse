import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CasePicker } from './CasePicker'

const cases = [
  { id: 'c1', title: 'Onboarding — caso 1' },
  { id: 'c2', title: 'Onboarding — caso 2' },
  { id: 'c3', title: 'Verificar documento ID' },
]

describe('CasePicker', () => {
  it('shows a trigger button and no dialog until opened', () => {
    render(<CasePicker cases={cases} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add case/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a searchable dialog listing every case', async () => {
    render(<CasePicker cases={cases} onSelect={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add case/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Onboarding — caso 1')).toBeInTheDocument()
    expect(screen.getByText('Verificar documento ID')).toBeInTheDocument()
  })

  it('filters the list as the user types', async () => {
    render(<CasePicker cases={cases} onSelect={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add case/i }))
    await userEvent.type(screen.getByPlaceholderText(/search cases/i), 'documento')
    expect(screen.getByText('Verificar documento ID')).toBeInTheDocument()
    expect(screen.queryByText('Onboarding — caso 1')).not.toBeInTheDocument()
  })

  it('shows a message when no case matches the search', async () => {
    render(<CasePicker cases={cases} onSelect={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add case/i }))
    await userEvent.type(screen.getByPlaceholderText(/search cases/i), 'nonexistent')
    expect(screen.getByText(/no matching cases/i)).toBeInTheDocument()
  })

  it('calls onSelect and closes the dialog when a case is clicked', async () => {
    const onSelect = vi.fn()
    render(<CasePicker cases={cases} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /add case/i }))
    await userEvent.click(await screen.findByText('Onboarding — caso 2'))
    expect(onSelect).toHaveBeenCalledWith('c2')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resets the search query each time it is reopened', async () => {
    render(<CasePicker cases={cases} onSelect={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add case/i }))
    await userEvent.type(screen.getByPlaceholderText(/search cases/i), 'documento')
    await userEvent.click(await screen.findByText('Verificar documento ID'))

    await userEvent.click(screen.getByRole('button', { name: /add case/i }))
    expect(screen.getByText('Onboarding — caso 1')).toBeInTheDocument()
  })
})
