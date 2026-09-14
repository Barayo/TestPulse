import { describe, expect, it } from 'vitest'
import { runItemUrl } from './runItemUrl'

describe('runItemUrl', () => {
  it('links to the plain caseKey route when the item has no testName', () => {
    expect(runItemUrl('r1', { caseKey: 'c1' })).toBe('/runs/r1/items/c1')
  })

  it('appends ?row= (URL-encoded) when the item carries a testName, disambiguating same-caseKey items', () => {
    expect(runItemUrl('r1', { caseKey: 'c1', testName: 'valid / edge case' })).toBe(
      '/runs/r1/items/c1?row=valid%20%2F%20edge%20case',
    )
  })
})
