import { describe, expect, it } from 'vitest'
import { diffContent, diffSignal } from './versionDiff'

const base = {
  title: 'Login works',
  description: '',
  expectedResult: '',
  priority: 'medium' as const,
  tags: [],
  platform: '',
  testType: '',
  automated: false,
  steps: [{ action: 'Enter credentials', expected: 'Signed in' }],
}

describe('diffContent', () => {
  it('detects changed scalar fields', () => {
    const diff = diffContent(base, { ...base, title: 'Login works v2' })
    expect(diff.fields).toEqual([{ label: 'Title', before: 'Login works', after: 'Login works v2' }])
  })

  it('detects a changed step', () => {
    const diff = diffContent(base, { ...base, steps: [{ action: 'Enter creds', expected: 'Signed in' }] })
    expect(diff.steps).toEqual([
      { index: 0, kind: 'changed', before: base.steps[0], after: { action: 'Enter creds', expected: 'Signed in' } },
    ])
  })
})

describe('diffSignal', () => {
  it('names up to 2 changed fields', () => {
    expect(diffSignal({ fields: [{ label: 'Priority', before: 'low', after: 'high' }], steps: [] })).toBe(
      'Priority changed',
    )
    expect(
      diffSignal({
        fields: [
          { label: 'Priority', before: 'low', after: 'high' },
          { label: 'Tags', before: '', after: 'smoke' },
        ],
        steps: [],
      }),
    ).toBe('Priority, Tags changed')
  })

  it('collapses to a count beyond 2 changed fields', () => {
    expect(
      diffSignal({
        fields: [
          { label: 'Priority', before: '', after: '' },
          { label: 'Tags', before: '', after: '' },
          { label: 'Platform', before: '', after: '' },
        ],
        steps: [],
      }),
    ).toBe('3 fields changed')
  })

  it('includes "Steps" as one label among the up-to-2', () => {
    expect(
      diffSignal({ fields: [{ label: 'Priority', before: '', after: '' }], steps: [{ index: 0, kind: 'added' }] }),
    ).toBe('Priority, Steps changed')
  })

  it('returns "No changes" when nothing differs', () => {
    expect(diffSignal({ fields: [], steps: [] })).toBe('No changes')
  })
})
