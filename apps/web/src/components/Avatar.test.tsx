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
})
