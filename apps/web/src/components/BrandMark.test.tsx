import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrandMark } from './BrandMark'

describe('BrandMark', () => {
  it('renders the TestPulse icon and wordmark', () => {
    render(<BrandMark />)
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getByText('Pulse')).toBeInTheDocument()
    expect(document.querySelector('svg[viewBox="0 0 200 200"]')).toBeInTheDocument()
  })
})
