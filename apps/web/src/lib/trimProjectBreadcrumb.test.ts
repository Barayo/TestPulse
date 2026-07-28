import { describe, expect, it } from 'vitest'
import { trimProjectBreadcrumb } from './trimProjectBreadcrumb'

describe('trimProjectBreadcrumb', () => {
  it('drops the leading Projects and project segments — the header chip already covers them', () => {
    const result = trimProjectBreadcrumb([
      { label: 'Projects', href: '/' },
      { label: 'QA Platform', href: '/projects/p1' },
      { label: 'Suites' },
    ])
    expect(result).toEqual([{ label: 'Suites' }])
  })

  it('also drops a trailing segment that duplicates the current page heading', () => {
    const result = trimProjectBreadcrumb(
      [{ label: 'Projects', href: '/' }, { label: 'QA Platform', href: '/projects/p1' }, { label: 'Suites' }],
      'Suites',
    )
    expect(result).toEqual([])
  })

  it('keeps a trailing segment that does not match the current page heading', () => {
    const result = trimProjectBreadcrumb(
      [
        { label: 'Projects', href: '/' },
        { label: 'QA Platform', href: '/projects/p1' },
        { label: 'Suites', href: '/projects/p1/suites' },
        { label: 'Smoke Suite' },
      ],
      'Smoke Suite',
    )
    expect(result).toEqual([{ label: 'Suites', href: '/projects/p1/suites' }])
  })

  it('leaves a real middle segment untouched when no heading is given to compare against', () => {
    const result = trimProjectBreadcrumb([
      { label: 'Projects', href: '/' },
      { label: 'QA Platform', href: '/projects/p1' },
      { label: 'Library', href: '/projects/p1/library' },
      { label: 'Server' },
    ])
    expect(result).toEqual([{ label: 'Library', href: '/projects/p1/library' }, { label: 'Server' }])
  })

  it('returns an empty array when there is nothing beyond Projects and the project', () => {
    const result = trimProjectBreadcrumb([{ label: 'Projects', href: '/' }, { label: 'QA Platform' }])
    expect(result).toEqual([])
  })
})
