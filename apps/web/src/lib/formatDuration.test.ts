import { describe, expect, it } from 'vitest'
import { formatDuration } from './formatDuration'

describe('formatDuration', () => {
  it('formats sub-minute durations as seconds only', () => {
    expect(formatDuration(52_000)).toBe('52s')
  })

  it('formats sub-hour durations as minutes and seconds', () => {
    expect(formatDuration(4 * 60_000 + 12_000)).toBe('4m 12s')
  })

  it('formats hour-scale durations as hours and minutes', () => {
    expect(formatDuration(60 * 60_000 + 3 * 60_000)).toBe('1h 03m')
  })

  it('rounds down to the nearest second', () => {
    expect(formatDuration(1_999)).toBe('1s')
  })

  it('formats zero as 0s', () => {
    expect(formatDuration(0)).toBe('0s')
  })
})
