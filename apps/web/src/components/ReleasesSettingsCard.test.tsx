import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ReleasesSettingsCard } from './ReleasesSettingsCard'

describe('ReleasesSettingsCard', () => {
  it('links to the project\'s Releases page', () => {
    render(
      <MemoryRouter>
        <ReleasesSettingsCard projectKey="SHOP" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Releases')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /manage releases/i })).toHaveAttribute('href', '/projects/SHOP/releases')
  })
})
