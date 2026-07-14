import { describe, expect, it } from 'vitest'
import { timeAgo } from './timeAgo'

const NOW = new Date('2026-07-14T12:00:00Z')

describe('timeAgo', () => {
  it('renders seconds as "just now"', () => {
    expect(timeAgo('2026-07-14T11:59:40Z', NOW)).toBe('just now')
  })

  it('renders minutes', () => {
    expect(timeAgo('2026-07-14T11:45:00Z', NOW)).toBe('15 minutes ago')
    expect(timeAgo('2026-07-14T11:59:00Z', NOW)).toBe('1 minute ago')
  })

  it('renders hours', () => {
    expect(timeAgo('2026-07-14T09:00:00Z', NOW)).toBe('3 hours ago')
    expect(timeAgo('2026-07-14T11:00:00Z', NOW)).toBe('1 hour ago')
  })

  it('renders days', () => {
    expect(timeAgo('2026-07-10T12:00:00Z', NOW)).toBe('4 days ago')
    expect(timeAgo('2026-07-13T12:00:00Z', NOW)).toBe('1 day ago')
  })

  it('renders months', () => {
    expect(timeAgo('2026-04-14T12:00:00Z', NOW)).toBe('3 months ago')
    expect(timeAgo('2026-06-13T12:00:00Z', NOW)).toBe('1 month ago')
  })

  it('renders years', () => {
    expect(timeAgo('2023-07-14T12:00:00Z', NOW)).toBe('3 years ago')
    expect(timeAgo('2025-07-10T12:00:00Z', NOW)).toBe('1 year ago')
  })
})
