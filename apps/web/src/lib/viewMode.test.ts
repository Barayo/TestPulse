import { describe, expect, it } from 'vitest'
import { resolveViewMode } from './viewMode'

describe('resolveViewMode', () => {
  it('defaults to expanded for small project counts on desktop', () => {
    expect(resolveViewMode(10, false, null)).toBe('expanded')
  })

  it('defaults to compact for large project counts on desktop', () => {
    expect(resolveViewMode(11, false, null)).toBe('compact')
  })

  it('always renders compact on mobile regardless of project count', () => {
    expect(resolveViewMode(3, true, null)).toBe('compact')
  })

  it('lets a manual override win over the automatic count-based choice on desktop', () => {
    expect(resolveViewMode(3, false, 'compact')).toBe('compact')
    expect(resolveViewMode(50, false, 'expanded')).toBe('expanded')
  })

  it('ignores a manual override on mobile — mobile is always compact', () => {
    expect(resolveViewMode(3, true, 'expanded')).toBe('compact')
  })
})
