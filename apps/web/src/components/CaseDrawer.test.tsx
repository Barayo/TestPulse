import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaseDrawer } from './CaseDrawer'

describe('CaseDrawer — create mode', () => {
  it('creates a case with a title and steps (action + optional expected result)', async () => {
    const onCreate = vi.fn()
    render(
      <CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={onCreate} />,
    )
    await userEvent.type(screen.getByLabelText(/title/i), 'Daily transfer limit')
    const actionInputs = screen.getAllByLabelText(/^action for step/i)
    await userEvent.type(actionInputs[0], 'Start a transfer over the limit')
    const expectedInputs = screen.getAllByLabelText(/^expected result for step/i)
    await userEvent.type(expectedInputs[0], 'The system blocks the transfer')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Daily transfer limit',
      steps: [{ action: 'Start a transfer over the limit', expected: 'The system blocks the transfer' }],
    })
  })

  it('adds and removes steps', async () => {
    render(<CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.getAllByLabelText(/^action for step/i)).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /add step/i }))
    expect(screen.getAllByLabelText(/^action for step/i)).toHaveLength(2)
    await userEvent.click(screen.getAllByRole('button', { name: /remove step/i })[0])
    expect(screen.getAllByLabelText(/^action for step/i)).toHaveLength(1)
  })

  it('does not create a case without a title', async () => {
    const onCreate = vi.fn()
    render(<CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={onCreate} />)
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('filters out steps with no action before submitting', async () => {
    const onCreate = vi.fn()
    render(<CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={onCreate} />)
    await userEvent.type(screen.getByLabelText(/title/i), 'Case with empty step')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))
    expect(onCreate).toHaveBeenCalledWith({ title: 'Case with empty step', steps: [] })
  })
})

describe('CaseDrawer — view mode', () => {
  const viewProps = {
    mode: 'view' as const,
    open: true,
    folderName: 'Transferencias',
    onClose: vi.fn(),
    caseTitle: 'Daily transfer limit',
    currentVersion: 2,
    steps: [{ action: 'Start a transfer over the limit', expected: 'Blocked before confirming' }],
    suiteNames: ['Smoke', 'Regression'],
    versions: [
      { version: 2, createdAt: '2026-02-01T00:00:00Z' },
      { version: 1, createdAt: '2026-01-01T00:00:00Z' },
    ],
    onSaveEdit: vi.fn(),
  }

  it('shows the title, version, suite pills, and read-only steps', () => {
    render(<CaseDrawer {...viewProps} />)
    expect(screen.getByText('Daily transfer limit')).toBeInTheDocument()
    expect(screen.getAllByText('v2').length).toBeGreaterThan(0)
    expect(screen.getByText('Smoke')).toBeInTheDocument()
    expect(screen.getByText('Regression')).toBeInTheDocument()
    expect(screen.getByText('Start a transfer over the limit')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^action for step/i)).not.toBeInTheDocument()
  })

  it('shows the version history with the current version marked', () => {
    render(<CaseDrawer {...viewProps} />)
    const history = screen.getByRole('list', { name: /version history/i })
    expect(within(history).getByText('v2')).toBeInTheDocument()
    expect(within(history).getByText('v1')).toBeInTheDocument()
    expect(within(history).getByText(/current/i)).toBeInTheDocument()
  })

  it('switches to editable steps when Edit is clicked, and saves', async () => {
    const onSaveEdit = vi.fn()
    render(<CaseDrawer {...viewProps} onSaveEdit={onSaveEdit} />)
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(screen.getByLabelText(/^action for step 1/i)).toHaveValue('Start a transfer over the limit')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(onSaveEdit).toHaveBeenCalledWith({
      title: 'Daily transfer limit',
      steps: [{ action: 'Start a transfer over the limit', expected: 'Blocked before confirming' }],
    })
  })

  it('returns to read-only view (with version history visible again) after saving', async () => {
    render(<CaseDrawer {...viewProps} />)
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(screen.queryByLabelText(/^action for step/i)).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: /version history/i })).toBeInTheDocument()
  })

  it('cancels an edit without saving', async () => {
    const onSaveEdit = vi.fn()
    render(<CaseDrawer {...viewProps} onSaveEdit={onSaveEdit} />)
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onSaveEdit).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/^action for step/i)).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: /version history/i })).toBeInTheDocument()
  })
})
