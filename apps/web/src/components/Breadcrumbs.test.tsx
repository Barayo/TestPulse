import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Breadcrumbs } from './Breadcrumbs'

function renderCrumbs(segments: { label: string; href?: string }[]) {
  return render(
    <MemoryRouter>
      <Breadcrumbs segments={segments} />
    </MemoryRouter>,
  )
}

describe('Breadcrumbs', () => {
  it('renders a two-segment path with the first segment linked', () => {
    renderCrumbs([{ label: 'Projects', href: '/' }, { label: 'QA Platform' }])
    const link = screen.getByRole('link', { name: 'Projects' })
    expect(link).toHaveAttribute('href', '/')
    expect(screen.getByText('QA Platform')).toBeInTheDocument()
  })

  it('renders a three-segment path with only ancestors linked', () => {
    renderCrumbs([
      { label: 'Projects', href: '/' },
      { label: 'QA Platform', href: '/projects/p1' },
      { label: 'Sprint 1' },
    ])
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'QA Platform' })).toHaveAttribute(
      'href',
      '/projects/p1',
    )
    // The last segment is not a link.
    expect(screen.queryByRole('link', { name: 'Sprint 1' })).not.toBeInTheDocument()
    expect(screen.getByText('Sprint 1')).toBeInTheDocument()
  })

  it('does not link the last segment even if it has an href', () => {
    renderCrumbs([{ label: 'Projects', href: '/' }, { label: 'QA Platform', href: '/projects/p1' }])
    expect(screen.queryByRole('link', { name: 'QA Platform' })).not.toBeInTheDocument()
  })

  it('renders nothing for a single segment — it would only repeat the page heading below it', () => {
    renderCrumbs([{ label: 'Projects' }])
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
    expect(screen.queryByText('Projects')).not.toBeInTheDocument()
  })

  it('renders nothing for an empty segment list', () => {
    renderCrumbs([])
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
  })
})
