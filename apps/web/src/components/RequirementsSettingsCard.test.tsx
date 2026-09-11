import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { RequirementsSettingsCard } from './RequirementsSettingsCard'

describe('RequirementsSettingsCard', () => {
  it("links to the project's Requirements page", () => {
    render(
      <MemoryRouter>
        <RequirementsSettingsCard projectKey="SHOP" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Requirements')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /manage requirements/i })).toHaveAttribute('href', '/projects/SHOP/requirements')
  })
})
