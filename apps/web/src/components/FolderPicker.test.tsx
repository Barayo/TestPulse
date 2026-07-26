import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FolderPicker } from './FolderPicker'

const root = { id: 'root', name: 'Root', parentFolderId: undefined }
const transferencias = { id: 'transferencias', name: 'Transferencias', parentFolderId: 'root' }
const nacionales = { id: 'nacionales', name: 'Nacionales', parentFolderId: 'transferencias' }
const folders = [root, transferencias, nacionales]
const folderStats = {
  root: { count: 0 },
  transferencias: { count: 3 },
  nacionales: { count: 1 },
}

describe('FolderPicker', () => {
  it('lists every folder by its own name, "Library" standing in for the root', () => {
    render(<FolderPicker folders={folders} rootId="root" query="" onQueryChange={() => {}} onSelect={() => {}} />)
    expect(screen.getByText('Library')).toBeInTheDocument()
    expect(screen.getByText('Transferencias')).toBeInTheDocument()
    expect(screen.getByText('Nacionales')).toBeInTheDocument()
  })

  it('carries the full path as a title attribute for disambiguation on hover', () => {
    render(<FolderPicker folders={folders} rootId="root" query="" onQueryChange={() => {}} onSelect={() => {}} />)
    expect(screen.getByText('Nacionales')).toHaveAttribute('title', 'Library / Transferencias / Nacionales')
  })

  it('filters the list by the query, matched against the folder’s own name', () => {
    render(
      <FolderPicker folders={folders} rootId="root" query="Nacionales" onQueryChange={() => {}} onSelect={() => {}} />,
    )
    expect(screen.queryByText('Library')).not.toBeInTheDocument()
    expect(screen.queryByText('Transferencias')).not.toBeInTheDocument()
    expect(screen.getByText('Nacionales')).toBeInTheDocument()
  })

  it('calls onSelect with the folder id when a row is clicked', async () => {
    const onSelect = vi.fn()
    render(<FolderPicker folders={folders} rootId="root" query="" onQueryChange={() => {}} onSelect={onSelect} />)
    await userEvent.click(screen.getByText('Nacionales'))
    expect(onSelect).toHaveBeenCalledWith('nacionales')
  })

  it('calls onQueryChange as the search input changes', async () => {
    const onQueryChange = vi.fn()
    render(<FolderPicker folders={folders} rootId="root" query="" onQueryChange={onQueryChange} onSelect={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText(/search sections/i), 'N')
    expect(onQueryChange).toHaveBeenCalledWith('N')
  })

  describe('hierarchy and case counts (rework-library-ux)', () => {
    it('indents rows by depth', () => {
      render(<FolderPicker folders={folders} rootId="root" query="" onQueryChange={() => {}} onSelect={() => {}} />)
      const rootRow = screen.getByText('Library').closest('button') as HTMLElement
      const childRow = screen.getByText('Transferencias').closest('button') as HTMLElement
      const grandchildRow = screen.getByText('Nacionales').closest('button') as HTMLElement
      const rootPad = parseInt(rootRow.style.paddingLeft, 10)
      const childPad = parseInt(childRow.style.paddingLeft, 10)
      const grandchildPad = parseInt(grandchildRow.style.paddingLeft, 10)
      expect(childPad).toBeGreaterThan(rootPad)
      expect(grandchildPad).toBeGreaterThan(childPad)
    })

    it('shows a per-row case count when folderStats is provided', () => {
      render(
        <FolderPicker
          folders={folders}
          rootId="root"
          query=""
          onQueryChange={() => {}}
          onSelect={() => {}}
          folderStats={folderStats}
        />,
      )
      expect(screen.getByText('3 cases')).toBeInTheDocument()
      expect(screen.getByText('1 case')).toBeInTheDocument()
    })
  })
})
