import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './card'

describe('Card (visual-elevation-redesign)', () => {
  it('uses a real elevation shadow instead of a flat ring', () => {
    render(<Card data-testid="card">content</Card>)
    const card = screen.getByTestId('card')
    expect(card.className).toContain('shadow-[var(--elev-1),var(--elev-rim)]')
    expect(card.className).not.toContain('ring-1')
    expect(card.className).not.toContain('ring-foreground/10')
  })
})
