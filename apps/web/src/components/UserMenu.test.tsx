import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { UserMenu } from './UserMenu'

// Personal/account menu only — API tokens and Log out. Instance
// administration (Users/Teams) is a separate top-level AdminMenu
// (add-project-rbac): it isn't a personal-account concern, so it doesn't
// belong under the email, and UserMenu itself has no notion of Tenant Admin.
function renderMenu(onLogout = vi.fn()) {
  return render(
    <MemoryRouter>
      <UserMenu user={{ id: 'u1', email: 'jane@example.com' }} onLogout={onLogout} />
    </MemoryRouter>,
  )
}

describe('UserMenu', () => {
  it('shows the trigger with the user email and no menu until opened', () => {
    renderMenu()
    expect(screen.getByRole('button', { name: /jane@example.com/i })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the menu with Profile, API tokens, and Log out only', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: /jane@example.com/i }))
    expect(screen.getByRole('menuitem', { name: /^profile$/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /api tokens/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^users$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^teams$/i })).not.toBeInTheDocument()
  })

  it('the trigger shows an Avatar chip, not just plain text (add-user-profile)', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: /jane@example.com/i })
    expect(trigger.querySelector('img, span[style]')).not.toBeNull()
  })

  it('the Profile menuitem links to /settings/profile', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: /jane@example.com/i }))
    expect(screen.getByRole('menuitem', { name: /^profile$/i })).toHaveAttribute('href', '/settings/profile')
  })

  it('calls onLogout when Log out is clicked', async () => {
    const onLogout = vi.fn()
    renderMenu(onLogout)
    await userEvent.click(screen.getByRole('button', { name: /jane@example.com/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /log out/i }))
    expect(onLogout).toHaveBeenCalled()
  })
})
