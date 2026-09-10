import { describe, expect, it } from 'vitest'
import { resolveSuiteCaseKeys } from './resolveSuiteCaseKeys'
import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']
type TestCase = components['schemas']['TestCase']

const root: Folder = { id: 'root', projectId: 'p1', name: 'Root', slug: 'root', createdAt: '' }
const authentication: Folder = { id: 'authentication', projectId: 'p1', parentFolderId: 'root', name: 'Authentication', slug: 'authentication', createdAt: '' }
const twoFactor: Folder = { id: 'two-factor', projectId: 'p1', parentFolderId: 'authentication', name: 'Two-Factor', slug: 'two-factor', createdAt: '' }
const backupCodes: Folder = { id: 'backup-codes', projectId: 'p1', parentFolderId: 'two-factor', name: 'Backup Codes', slug: 'backup-codes', createdAt: '' }
const folders = [root, authentication, twoFactor, backupCodes]

function makeCase(key: string, folderId: string): TestCase {
  return {
    id: key,
    key,
    projectId: 'p1',
    folderId,
    currentVersion: 1,
    content: {
      title: key,
      description: '',
      steps: [],
      expectedResult: '',
      priority: 'medium',
      tags: [],
    },
    createdAt: '',
    updatedAt: '',
  }
}

const sp12 = makeCase('SP-12', 'authentication')
const sp13 = makeCase('SP-13', 'authentication')
const sp16 = makeCase('SP-16', 'two-factor')
const sp17 = makeCase('SP-17', 'two-factor')
const sp18 = makeCase('SP-18', 'backup-codes')
const cases = [sp12, sp13, sp16, sp17, sp18]

describe('resolveSuiteCaseKeys', () => {
  it('returns directly-selected case keys when no folders are selected', () => {
    expect(resolveSuiteCaseKeys([], ['SP-12', 'SP-13'], folders, cases)).toEqual(
      expect.arrayContaining(['SP-12', 'SP-13']),
    )
    expect(resolveSuiteCaseKeys([], ['SP-12', 'SP-13'], folders, cases)).toHaveLength(2)
  })

  it('resolves a selected folder into its direct cases', () => {
    const result = resolveSuiteCaseKeys(['authentication'], [], folders, cases)
    // authentication's own subtree also includes two-factor/backup-codes,
    // so its direct cases plus every nested case all resolve.
    expect(result.sort()).toEqual(['SP-12', 'SP-13', 'SP-16', 'SP-17', 'SP-18'])
  })

  it('recurses into nested subfolders at any depth', () => {
    const result = resolveSuiteCaseKeys(['two-factor'], [], folders, cases)
    expect(result.sort()).toEqual(['SP-16', 'SP-17', 'SP-18'])
  })

  it('unions direct cases and folder-resolved cases without duplicating overlap', () => {
    const result = resolveSuiteCaseKeys(['two-factor'], ['SP-12', 'SP-13'], folders, cases)
    expect(result.sort()).toEqual(['SP-12', 'SP-13', 'SP-16', 'SP-17', 'SP-18'])
  })

  it('does not double-count a case reachable through two overlapping selected folders', () => {
    const result = resolveSuiteCaseKeys(['two-factor', 'backup-codes'], [], folders, cases)
    expect(result.sort()).toEqual(['SP-16', 'SP-17', 'SP-18'])
  })

  it('does not double-count a case that is both directly selected and inside a selected folder', () => {
    const result = resolveSuiteCaseKeys(['two-factor'], ['SP-16'], folders, cases)
    expect(result.sort()).toEqual(['SP-16', 'SP-17', 'SP-18'])
  })

  it('returns an empty array for a folder with no cases anywhere in its subtree', () => {
    const emptyFolder: Folder = { id: 'empty', projectId: 'p1', parentFolderId: 'root', name: 'Empty', slug: 'empty', createdAt: '' }
    const result = resolveSuiteCaseKeys(['empty'], [], [...folders, emptyFolder], cases)
    expect(result).toEqual([])
  })
})
