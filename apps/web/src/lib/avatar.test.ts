import { describe, expect, it } from 'vitest'
import { avatarStyle, initialsFor } from './avatar'

describe('initialsFor', () => {
  it('uppercases the first letter of a plain name', () => {
    expect(initialsFor('jane')).toBe('J')
  })

  it('uses the part before @ for an email address', () => {
    expect(initialsFor('jane@example.com')).toBe('J')
  })

  it('falls back to "?" for an empty seed', () => {
    expect(initialsFor('')).toBe('?')
  })
})

describe('avatarStyle', () => {
  it('deterministically assigns the same hue to the same seed', () => {
    expect(avatarStyle('jane')).toEqual(avatarStyle('jane'))
  })

  it('returns a background/foreground color pair referencing an avatar hue variable', () => {
    const style = avatarStyle('jane')
    expect(style.backgroundColor).toMatch(/^var\(--avatar-\d-bg\)$/)
    expect(style.color).toMatch(/^var\(--avatar-\d-fg\)$/)
  })
})
