import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('truncates a long last segment instead of letting it wrap word-by-word', () => {
    renderCrumbs([
      { label: 'Projects', href: '/' },
      { label: 'TestPulse', href: '/projects/p1' },
      { label: 'Library', href: '/projects/p1/library' },
      { label: 'Server', href: '/projects/p1/library/f1' },
      { label: 'Tenant admin manages roles over HTTP' },
    ])
    const last = screen.getByText('Tenant admin manages roles over HTTP')
    expect(last).toHaveClass('truncate')
    // Earlier segments never wrap or shrink below their natural width.
    expect(screen.getByRole('link', { name: 'Server' }).parentElement).toHaveClass('shrink-0')
  })

  it('gives the last segment a minimum-width floor so it can\'t collapse to zero width when earlier segments alone already overflow the nav', () => {
    // flex-1 + min-w-0 lets a flex item shrink all the way to 0 once the
    // shrink-0 segments ahead of it already exceed the container — the
    // segment silently disappears instead of the nav's overflow-x-auto
    // scrolling to reveal it (found via e2e: a long project name pushed a
    // folder name's breadcrumb crumb to zero width, rendering it invisible).
    // A minimum-width floor gives truncate/ellipsis text a guaranteed
    // renderable box, forcing the row to scroll instead of collapsing it.
    renderCrumbs([
      { label: 'Projects', href: '/' },
      { label: 'A Rather Long Project Name For This Team', href: '/projects/p1' },
      { label: 'Library', href: '/projects/p1/library' },
      { label: 'Cards' },
    ])
    const last = screen.getByText('Cards')
    expect(last).not.toHaveClass('min-w-0')
    expect(last.parentElement).not.toHaveClass('min-w-0')
  })

  it('never wraps the breadcrumb text onto multiple lines', () => {
    renderCrumbs([{ label: 'Projects', href: '/' }, { label: 'A very long current page title indeed' }])
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveClass('flex-nowrap')
  })

  describe('deep paths (more than 5 segments)', () => {
    const deepPath = [
      { label: 'Projects', href: '/' },
      { label: 'Banca Móvil', href: '/projects/p1' },
      { label: 'Library', href: '/projects/p1/library' },
      { label: 'Transferencias', href: '/projects/p1/library/f1' },
      { label: 'Nacionales', href: '/projects/p1/library/f2' },
      { label: 'Lorem Ipsum', href: '/projects/p1/library/f3' },
      { label: 'Sed volutpat malesuada' },
    ]

    it('does not collapse at exactly 5 segments — the common real case is unaffected', () => {
      renderCrumbs(deepPath.slice(0, 5))
      expect(screen.queryByRole('button', { name: /hidden path segments/i })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Transferencias' })).toBeInTheDocument()
    })

    it('collapses the middle once beyond 5 segments, keeping the first two and last two visible', () => {
      renderCrumbs(deepPath)
      expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Banca Móvil' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Lorem Ipsum' })).toBeInTheDocument()
      expect(screen.getByText('Sed volutpat malesuada')).toBeInTheDocument()
      // The middle (Library, Transferencias, Nacionales) is hidden, not gone.
      expect(screen.queryByRole('link', { name: 'Library' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Transferencias' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Nacionales' })).not.toBeInTheDocument()
    })

    it('keeps the current page as the only non-link, full-width segment when collapsed', () => {
      renderCrumbs(deepPath)
      const current = screen.getByText('Sed volutpat malesuada')
      expect(current.closest('a')).toBeNull()
      expect(current).toHaveClass('min-w-16')
    })

    it('opens a menu listing the hidden segments in order, each a working link', async () => {
      renderCrumbs(deepPath)
      const trigger = screen.getByRole('button', { name: /3 hidden path segments/i })
      await userEvent.click(trigger)

      const menu = screen.getByRole('menu', { name: /hidden path segments/i })
      const links = within(menu).getAllByRole('menuitem')
      expect(links.map((l) => l.textContent)).toEqual(['Library', 'Transferencias', 'Nacionales'])
      expect(links[1]).toHaveAttribute('href', '/projects/p1/library/f1')
    })

    it('closes the hidden-segments menu when a link inside it is clicked', async () => {
      renderCrumbs(deepPath)
      await userEvent.click(screen.getByRole('button', { name: /hidden path segments/i }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Transferencias' }))
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('closes the hidden-segments menu on Escape', async () => {
      renderCrumbs(deepPath)
      await userEvent.click(screen.getByRole('button', { name: /hidden path segments/i }))
      expect(screen.getByRole('menu')).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('caps the width of every visible segment, not just the last, once collapsed', () => {
      // Unlike the short (≤5) case, we can no longer assume earlier segments
      // are short structural labels — the immediate-parent segment is now a
      // freeform folder name too, and could itself be long.
      renderCrumbs(deepPath)
      expect(screen.getByRole('link', { name: 'Banca Móvil' })).toHaveClass('max-w-32')
      expect(screen.getByRole('link', { name: 'Lorem Ipsum' })).toHaveClass('max-w-32')
    })
  })
})
