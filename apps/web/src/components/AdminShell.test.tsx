import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AdminShell } from './AdminShell'

describe('AdminShell', () => {
  it('renders a People / Roles / Instance tab strip, plus its children', () => {
    render(
      <MemoryRouter initialEntries={['/settings/people']}>
        <AdminShell>
          <p>Page content</p>
        </AdminShell>
      </MemoryRouter>,
    )
    expect(screen.getByRole('tab', { name: /people/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /roles/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /instance/i })).toBeInTheDocument()
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('marks the tab matching the current route as selected', () => {
    render(
      <MemoryRouter initialEntries={['/settings/roles']}>
        <AdminShell>
          <p>Page content</p>
        </AdminShell>
      </MemoryRouter>,
    )
    expect(screen.getByRole('tab', { name: /roles/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /people/i })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: /instance/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('each tab links to its own admin page', () => {
    render(
      <MemoryRouter initialEntries={['/settings/people']}>
        <AdminShell>
          <p>Page content</p>
        </AdminShell>
      </MemoryRouter>,
    )
    expect(screen.getByRole('tab', { name: /people/i })).toHaveAttribute('href', '/settings/people')
    expect(screen.getByRole('tab', { name: /roles/i })).toHaveAttribute('href', '/settings/roles')
    expect(screen.getByRole('tab', { name: /instance/i })).toHaveAttribute('href', '/settings/instance')
  })
})
