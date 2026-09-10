import { describe, expect, it } from 'vitest'
import { buildSlugPath, resolveSlugPath } from './folderSlugPath'
import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']

function folder(overrides: Partial<Folder> & { id: string; slug: string }): Folder {
  return {
    projectId: 'P',
    name: overrides.name ?? overrides.slug,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const root = folder({ id: 'root', slug: 'root', name: 'Root' })
const auth = folder({ id: 'auth', slug: 'authentication', name: 'Authentication', parentFolderId: 'root' })
const twoFactor = folder({ id: 'two-factor', slug: 'two-factor', name: 'Two-Factor', parentFolderId: 'auth' })
const settings = folder({ id: 'settings', slug: 'settings', name: 'Settings', parentFolderId: 'root' })

const allFolders = [root, auth, twoFactor, settings]

describe('buildSlugPath', () => {
  it('returns an empty string for the root folder', () => {
    expect(buildSlugPath(root, allFolders)).toBe('')
  })

  it('joins a single ancestor slug for a top-level folder', () => {
    expect(buildSlugPath(auth, allFolders)).toBe('authentication')
  })

  it('walks multiple ancestors and joins their slugs, deepest last', () => {
    expect(buildSlugPath(twoFactor, allFolders)).toBe('authentication/two-factor')
  })
})

describe('resolveSlugPath', () => {
  it('resolves an empty path to the root folder, not redirected', () => {
    const result = resolveSlugPath([], allFolders, root.id)
    expect(result).toEqual({ folder: root, redirected: false })
  })

  it('resolves a multi-segment path purely via live matches, not redirected', () => {
    const result = resolveSlugPath(['authentication', 'two-factor'], allFolders, root.id)
    expect(result).toEqual({ folder: twoFactor, redirected: false })
  })

  it('resolves a single top-level segment', () => {
    const result = resolveSlugPath(['settings'], allFolders, root.id)
    expect(result).toEqual({ folder: settings, redirected: false })
  })

  it('returns null when a segment matches no live folder', () => {
    expect(resolveSlugPath(['nonexistent'], allFolders, root.id)).toBeNull()
  })

  it('returns null for an empty segment (trailing or doubled slash)', () => {
    expect(resolveSlugPath(['authentication', ''], allFolders, root.id)).toBeNull()
    expect(resolveSlugPath([''], allFolders, root.id)).toBeNull()
  })

  it('falls back to a folder\'s previous identity after a move, and flags a redirect', () => {
    // "auth" was moved from root to "settings", freeing its old slug at
    // root but remembering it as its previous identity.
    const movedAuth = folder({
      id: 'auth',
      slug: 'authentication',
      name: 'Authentication',
      parentFolderId: 'settings',
      previousParentFolderId: 'root',
      previousSlug: 'authentication',
    })
    const folders = [root, settings, movedAuth]
    const result = resolveSlugPath(['authentication'], folders, root.id)
    expect(result).toEqual({ folder: movedAuth, redirected: true })
  })

  it('continues resolving remaining segments from the redirected folder\'s current children', () => {
    // "auth" moved from root to "settings"; "two-factor" is still its
    // live child. A bookmark to the OLD path (authentication/two-factor,
    // back when auth lived at root) must still resolve two-factor.
    const movedAuth = folder({
      id: 'auth',
      slug: 'authentication',
      name: 'Authentication',
      parentFolderId: 'settings',
      previousParentFolderId: 'root',
      previousSlug: 'authentication',
    })
    const folders = [root, settings, movedAuth, twoFactor]
    const result = resolveSlugPath(['authentication', 'two-factor'], folders, root.id)
    expect(result).toEqual({ folder: twoFactor, redirected: true })
  })

  it('returns null when a path survives only the most recent of two moves', () => {
    // auth's ORIGINAL identity (before its first move) is not recoverable
    // — only its single most recent previous identity is remembered.
    const twiceMovedAuth = folder({
      id: 'auth',
      slug: 'authentication',
      name: 'Authentication',
      parentFolderId: 'settings',
      previousParentFolderId: 'some-other-parent',
      previousSlug: 'authentication',
    })
    const folders = [root, settings, twiceMovedAuth]
    expect(resolveSlugPath(['authentication'], folders, root.id)).toBeNull()
  })
})
