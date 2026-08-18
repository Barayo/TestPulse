import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('renders a generated initial-on-color chip when no avatarKey is set', () => {
    render(<Avatar seed="ana@example.com" className="size-6 rounded-full" />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders the preset image when a known avatarKey is set', () => {
    render(<Avatar seed="ana@example.com" avatarKey="ada-lovelace" className="size-6 rounded-full" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src')
    expect(img.getAttribute('src')).toMatch(/ada-lovelace/)
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })

  it('falls back to the generated chip for an unrecognized avatarKey', () => {
    render(<Avatar seed="ana@example.com" avatarKey="not-a-real-preset" className="size-6 rounded-full" />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('passes the className through for sizing/shape', () => {
    render(<Avatar seed="ana@example.com" className="size-6 rounded-full" />)
    expect(screen.getByText('A')).toHaveClass('size-6', 'rounded-full')
  })

  it('renders an uploaded custom photo via the avatar endpoint when avatarKey is "custom"', () => {
    render(<Avatar seed="ana@example.com" avatarKey="custom" userId="u1" className="size-6 rounded-full" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', '/api/v1/users/u1/avatar')
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })

  it('falls back to the generated chip for "custom" with no userId to fetch from', () => {
    render(<Avatar seed="ana@example.com" avatarKey="custom" className="size-6 rounded-full" />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  // add-color-theme-customization follow-up (Pepe design review): preset
  // images are a fixed Teal duotone baked into the JPG pixels, so they
  // clash on a non-Teal instance palette unless retinted live. The filter
  // rides the same instance-wide --avatar-photo-filter token every other
  // derived value uses, defaulting to a no-op on Teal.
  it('applies the instance-wide --avatar-photo-filter token to a preset image', () => {
    render(<Avatar seed="ana@example.com" avatarKey="ada-lovelace" className="size-6 rounded-full" />)
    const img = screen.getByRole('img')
    expect(img).toHaveStyle({ filter: 'var(--avatar-photo-filter, none)' })
  })

  // A real uploaded photo is a person's actual face — recoloring it to
  // match the brand palette would be bizarre and is explicitly out of
  // scope (Pepe design review). Only preset images get the filter.
  it('does NOT apply the photo filter to an uploaded custom photo', () => {
    render(<Avatar seed="ana@example.com" avatarKey="custom" userId="u1" className="size-6 rounded-full" />)
    const img = screen.getByRole('img')
    expect(img.style.filter).toBe('')
  })
})
