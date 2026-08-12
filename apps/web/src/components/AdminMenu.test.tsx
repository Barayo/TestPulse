import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AdminMenu } from './AdminMenu'

describe('AdminMenu', () => {
  it('renders a single direct link to People, not a dropdown menu', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AdminMenu />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /admin/i })
    expect(link).toHaveAttribute('href', '/settings/people')
    expect(link).not.toHaveAttribute('aria-haspopup')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('is not marked current when outside the admin section', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AdminMenu />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /admin/i })).toHaveAttribute('aria-current', 'false')
  })

  it('is marked current when inside any admin page', () => {
    render(
      <MemoryRouter initialEntries={['/settings/roles']}>
        <AdminMenu />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /admin/i })).toHaveAttribute('aria-current', 'true')
  })
})
