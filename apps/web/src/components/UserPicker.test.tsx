import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserPicker } from './UserPicker'

const users = [
  { id: 'u1', email: 'jane@example.com' },
  { id: 'u2', email: 'bob@example.com' },
  { id: 'u3', email: 'ana@example.com' },
]

describe('UserPicker', () => {
  it('shows a trigger button and no dialog until opened', () => {
    render(<UserPicker users={users} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add member/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a searchable dialog listing every user', async () => {
    render(<UserPicker users={users} onSelect={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add member/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
  })

  it('filters the list as the user types', async () => {
    render(<UserPicker users={users} onSelect={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add member/i }))
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'jane')
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.queryByText('bob@example.com')).not.toBeInTheDocument()
  })

  it('shows a message when no user matches the search', async () => {
    render(<UserPicker users={users} onSelect={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /add member/i }))
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'nonexistent')
    expect(screen.getByText(/no matching users/i)).toBeInTheDocument()
  })

  it('calls onSelect and closes the dialog when a user is clicked', async () => {
    const onSelect = vi.fn()
    render(<UserPicker users={users} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /add member/i }))
    await userEvent.click(await screen.findByText('bob@example.com'))
    expect(onSelect).toHaveBeenCalledWith('u2')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
