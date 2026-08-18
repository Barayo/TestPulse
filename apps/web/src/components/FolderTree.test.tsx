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

  it('renders at the given width instead of a fixed size (add-resizable-library-tree)', () => {
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
        width={320}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Section tree' })).toHaveStyle({ width: '320px' })
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

  it('also offers "new subfolder" via a visible "⋯" trigger on every node, not just right-click', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: /new section in transferencias/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /new section/i }))
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

  it('carries the full folder name as a title attribute, so a truncated row is still readable on hover', () => {
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
    expect(screen.getByText('Transferencias')).toHaveAttribute('title', 'Transferencias')
  })

  describe('indentation at extreme depth', () => {
    // 7 levels deep — beyond the point where 16px/level indentation alone
    // would consume most of the panel's fixed width before any text renders.
    const deepFolders: TreeFolder[] = [
      { id: 'root', name: 'Root', parentFolderId: undefined },
      { id: 'd1', name: 'Depth 1', parentFolderId: 'root' },
      { id: 'd2', name: 'Depth 2', parentFolderId: 'd1' },
      { id: 'd3', name: 'Depth 3', parentFolderId: 'd2' },
      { id: 'd4', name: 'Depth 4', parentFolderId: 'd3' },
      { id: 'd5', name: 'Depth 5', parentFolderId: 'd4' },
      { id: 'd6', name: 'Depth 6', parentFolderId: 'd5' },
      { id: 'd7', name: 'Depth 7', parentFolderId: 'd6' },
    ]
    const allExpanded = new Set(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'])

    it('indents the first five levels at the normal 16px step', () => {
      render(
        <FolderTree
          folders={deepFolders}
          rootId="root"
          selectedId="d7"
          expanded={allExpanded}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onNewSubfolder={vi.fn()}
        />,
      )
      // depth 4 (0-indexed: "Depth 5" is the 5th level, depth index 4) → 8 + 4*16 = 72
      expect(screen.getByText('Depth 5').closest('div')).toHaveStyle({ paddingLeft: '72px' })
    })

    it('reduces the indentation step beyond depth 5, so extreme nesting does not consume the whole panel', () => {
      render(
        <FolderTree
          folders={deepFolders}
          rootId="root"
          selectedId="d7"
          expanded={allExpanded}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onNewSubfolder={vi.fn()}
        />,
      )
      // depth index 6 ("Depth 7"): capped at depth 5 (8+5*16=88) + 1 extra level at 4px = 92,
      // versus the uncapped 8+6*16=104 the old formula would have produced.
      expect(screen.getByText('Depth 7').closest('div')).toHaveStyle({ paddingLeft: '92px' })
    })
  })

  describe('per-folder direct case counts (rework-library-ux)', () => {
    it('shows a direct case count next to each folder name', () => {
      render(
        <FolderTree
          folders={folders}
          rootId="root"
          selectedId="transferencias"
          expanded={new Set()}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onNewSubfolder={vi.fn()}
          folderStats={{ transferencias: { count: 5, hasCritical: false } }}
        />,
      )
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('shows a critical-priority indicator when the folder has at least one critical case', () => {
      render(
        <FolderTree
          folders={folders}
          rootId="root"
          selectedId="transferencias"
          expanded={new Set()}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onNewSubfolder={vi.fn()}
          folderStats={{ transferencias: { count: 5, hasCritical: true } }}
        />,
      )
      expect(screen.getByLabelText(/contains a critical case/i)).toBeInTheDocument()
    })

    it('omits the critical indicator when no case in the folder is critical', () => {
      render(
        <FolderTree
          folders={folders}
          rootId="root"
          selectedId="transferencias"
          expanded={new Set()}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onNewSubfolder={vi.fn()}
          folderStats={{ transferencias: { count: 5, hasCritical: false } }}
        />,
      )
      expect(screen.queryByLabelText(/contains a critical case/i)).not.toBeInTheDocument()
    })

    it('shows a 0 count for a folder with no stats entry, rather than omitting it', () => {
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
      expect(screen.getByText('0')).toBeInTheDocument()
    })
  })

  it('closes the context menu when clicking outside it', async () => {
    render(
      <div>
        <FolderTree
          folders={folders}
          rootId="root"
          selectedId="transferencias"
          expanded={new Set()}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onNewSubfolder={vi.fn()}
        />
        <button type="button">Elsewhere</button>
      </div>,
    )
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Transferencias') })
    expect(await screen.findByRole('menuitem', { name: /new section/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('menuitem', { name: /new section/i })).not.toBeInTheDocument()
  })

  // Permission-gating retrofit (unify-authenticated-and-public-views
  // tasks.md 2.9): canCreate hides every row's "New section in…" trigger
  // entirely, not just disables it.
  it('hides every row\'s "New section in…" trigger when canCreate is false', () => {
    render(
      <FolderTree
        folders={folders}
        rootId="root"
        selectedId="transferencias"
        expanded={new Set()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onNewSubfolder={vi.fn()}
        canCreate={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /new section in transferencias/i })).not.toBeInTheDocument()
  })
})
