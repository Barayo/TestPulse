import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FolderPicker } from './FolderPicker'

const root = { id: 'root', name: 'Root', parentFolderId: undefined }
const transferencias = { id: 'transferencias', name: 'Transferencias', parentFolderId: 'root' }
const nacionales = { id: 'nacionales', name: 'Nacionales', parentFolderId: 'transferencias' }
const folders = [root, transferencias, nacionales]

describe('FolderPicker', () => {
  it('lists every folder with its full path, "Library" standing in for the root', () => {
    render(<FolderPicker folders={folders} rootId="root" query="" onQueryChange={() => {}} onSelect={() => {}} />)
    expect(screen.getByText('Library')).toBeInTheDocument()
    expect(screen.getByText('Library / Transferencias')).toBeInTheDocument()
    expect(screen.getByText('Library / Transferencias / Nacionales')).toBeInTheDocument()
  })

  it('filters the list by the query, matched against the full path', () => {
    render(
      <FolderPicker folders={folders} rootId="root" query="Nacionales" onQueryChange={() => {}} onSelect={() => {}} />,
    )
    expect(screen.queryByText('Library')).not.toBeInTheDocument()
    expect(screen.getByText('Library / Transferencias / Nacionales')).toBeInTheDocument()
  })

  it('calls onSelect with the folder id when a row is clicked', async () => {
    const onSelect = vi.fn()
    render(<FolderPicker folders={folders} rootId="root" query="" onQueryChange={() => {}} onSelect={onSelect} />)
    await userEvent.click(screen.getByText('Library / Transferencias / Nacionales'))
    expect(onSelect).toHaveBeenCalledWith('nacionales')
  })

  it('calls onQueryChange as the search input changes', async () => {
    const onQueryChange = vi.fn()
    render(<FolderPicker folders={folders} rootId="root" query="" onQueryChange={onQueryChange} onSelect={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText(/search sections/i), 'N')
    expect(onQueryChange).toHaveBeenCalledWith('N')
  })
})
