import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminMenu } from './AdminMenu'

describe('AdminMenu', () => {
  it('shows an "Admin" trigger and no menu until opened', () => {
    render(
      <MemoryRouter>
        <AdminMenu />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /admin/i })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens a menu with links to People and Roles', async () => {
    render(
      <MemoryRouter>
        <AdminMenu />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: /admin/i }))
    expect(screen.getByRole('menuitem', { name: /^people$/i })).toHaveAttribute('href', '/settings/people')
    expect(screen.getByRole('menuitem', { name: /^roles$/i })).toHaveAttribute('href', '/settings/roles')
  })

  it('closes the menu after selecting an item', async () => {
    render(
      <MemoryRouter>
        <AdminMenu />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: /admin/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^people$/i }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
