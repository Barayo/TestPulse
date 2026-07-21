import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaseSidebarSection } from './CaseSidebarSection'

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '(min-width: 768px)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CaseSidebarSection', () => {
  it('renders children directly, always visible, at desktop width', () => {
    mockMatchMedia(true)
    render(
      <CaseSidebarSection title="Properties">
        <p>Priority: Medium</p>
      </CaseSidebarSection>,
    )
    expect(screen.getByText('Priority: Medium')).toBeVisible()
  })

  it('wraps children in a closed, expandable section at mobile width', async () => {
    mockMatchMedia(false)
    render(
      <CaseSidebarSection title="Properties">
        <p>Priority: Medium</p>
      </CaseSidebarSection>,
    )
    const group = screen.getByText('Properties').closest('details')
    expect(group).not.toBeNull()
    expect(group).not.toHaveAttribute('open')

    await userEvent.click(screen.getByText('Properties'))
    expect(group).toHaveAttribute('open')
  })

  it('shows the section title in both layouts', () => {
    mockMatchMedia(true)
    render(
      <CaseSidebarSection title="Version history">
        <p>v1</p>
      </CaseSidebarSection>,
    )
    expect(screen.getByText('Version history')).toBeInTheDocument()
  })
})
