import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FolderTree, type TreeFolder } from './FolderTree'

const folders: TreeFolder[] = [
  { id: 'root', name: 'Root', parentFolderId: undefined },
  { id: 'transferencias', name: 'Transferencias', parentFolderId: 'root' },
  { id: 'nacionales', name: 'Nacionales', parentFolderId: 'transferencias' },
  { id: 'sepa', name: 'SEPA', parentFolderId: 'transferencias' },
  { id: 'iban', name: 'Validación IBAN', parentFolderId: 'sepa' },
]

describe('FolderTree', () => {
  it('renders top-level folders (children of root) and hides deeper levels until expanded', () => {
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
      />,
    )
    expect(screen.getByText('Transferencias')).toBeInTheDocument()
    expect(screen.queryByText('Nacionales')).not.toBeInTheDocument()
  })

  it('shows a folder’s children once it is expanded', () => {
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set(['transferencias'])}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
      />,
    )
    expect(screen.getByText('Nacionales')).toBeInTheDocument()
    expect(screen.getByText('SEPA')).toBeInTheDocument()
    expect(screen.queryByText('Validación IBAN')).not.toBeInTheDocument()
  })

  it('shows three nesting levels deep when each ancestor is expanded', () => {
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="iban"
        expanded={new Set(['transferencias', 'sepa'])}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
      />,
    )
    expect(screen.getByText('Validación IBAN')).toBeInTheDocument()
  })

  it('calls onSelect when a folder row is clicked', async () => {
    const onSelect = vi.fn()
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set()}
        onSelect={onSelect}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByText('Transferencias'))
    expect(onSelect).toHaveBeenCalledWith('transferencias')
  })

  it('calls onToggle when the expand/collapse chevron is clicked', async () => {
    const onToggle = vi.fn()
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set()}
        onSelect={vi.fn()}
        onToggle={onToggle}
        onNewSubfolder={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /expand transferencias/i }))
    expect(onToggle).toHaveBeenCalledWith('transferencias')
  })

  it('offers "new subfolder" via right-click on a tree node', async () => {
    const onNewSubfolder = vi.fn()
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={onNewSubfolder}
      />,
    )
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Transferencias') })
    await userEvent.click(await screen.findByRole('menuitem', { name: /new section/i }))
    expect(onNewSubfolder).toHaveBeenCalledWith('transferencias')
  })

  it('renders an inline editable row as a child of the folder being created in, without changing selection', () => {
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set(['transferencias'])}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
        creatingIn="transferencias"
        newFolderValue=""
        onNewFolderValueChange={vi.fn()}
        onConfirmNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox', { name: /new section name/i })).toBeInTheDocument()
  })

  it('confirms the inline new-folder row on Enter', async () => {
    const onConfirmNewFolder = vi.fn()
    const onNewFolderValueChange = vi.fn()
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set(['transferencias'])}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
        creatingIn="transferencias"
        newFolderValue="Devoluciones"
        onNewFolderValueChange={onNewFolderValueChange}
        onConfirmNewFolder={onConfirmNewFolder}
        onCancelNewFolder={vi.fn()}
      />,
    )
    await userEvent.type(screen.getByRole('textbox', { name: /new section name/i }), '{Enter}')
    expect(onConfirmNewFolder).toHaveBeenCalled()
  })

  it('cancels the inline new-folder row on Escape', async () => {
    const onCancelNewFolder = vi.fn()
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set(['transferencias'])}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
        creatingIn="transferencias"
        newFolderValue=""
        onNewFolderValueChange={vi.fn()}
        onConfirmNewFolder={vi.fn()}
        onCancelNewFolder={onCancelNewFolder}
      />,
    )
    await userEvent.type(screen.getByRole('textbox', { name: /new section name/i }), '{Escape}')
    expect(onCancelNewFolder).toHaveBeenCalled()
  })

  it('closes the context menu when clicking outside it', async () => {
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
      />,
    )
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Transferencias') })
    expect(await screen.findByRole('menuitem', { name: /new section/i })).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('context-menu-backdrop'))
    expect(screen.queryByRole('menuitem', { name: /new section/i })).not.toBeInTheDocument()
  })
})
