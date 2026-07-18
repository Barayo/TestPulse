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
      priority: 'medium',
      tags: [],
      platform: '',
      testType: '',
      automated: false,
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
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Case with empty step',
      steps: [],
      priority: 'medium',
      tags: [],
      platform: '',
      testType: '',
      automated: false,
    })
  })

  it('defaults priority to medium and lets a user set priority, tags, platform, test type, and automated', async () => {
    const onCreate = vi.fn()
    render(<CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={onCreate} />)
    expect(screen.getByLabelText(/priority/i)).toHaveValue('medium')

    await userEvent.type(screen.getByLabelText(/title/i), 'Login works')
    await userEvent.selectOptions(screen.getByLabelText(/priority/i), 'critical')
    await userEvent.type(screen.getByLabelText(/^tags/i), 'smoke, regression')
    await userEvent.type(screen.getByLabelText(/platform/i), 'web')
    await userEvent.type(screen.getByLabelText(/test type/i), 'e2e')
    await userEvent.click(screen.getByLabelText(/automated/i))
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Login works',
      steps: [],
      priority: 'critical',
      tags: ['smoke', 'regression'],
      platform: 'web',
      testType: 'e2e',
      automated: true,
    })
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
    priority: 'high' as const,
    tags: ['smoke', 'regression'],
    platform: 'web',
    testType: 'e2e',
    automated: true,
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

  it('shows priority, tags, platform, test type, and automated status', () => {
    render(<CaseDrawer {...viewProps} />)
    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('smoke')).toBeInTheDocument()
    expect(screen.getByText('regression')).toBeInTheDocument()
    expect(screen.getByText(/web/)).toBeInTheDocument()
    expect(screen.getByText(/e2e/)).toBeInTheDocument()
    expect(screen.getByText(/automated/i)).toBeInTheDocument()
  })

  it('omits platform/test type line and automated badge when unset', () => {
    render(<CaseDrawer {...viewProps} platform="" testType="" automated={false} />)
    expect(screen.queryByText(/platform/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^automated$/i)).not.toBeInTheDocument()
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
      priority: 'high',
      tags: ['smoke', 'regression'],
      platform: 'web',
      testType: 'e2e',
      automated: true,
    })
  })

  it('pre-fills classification fields when editing and includes changes in onSaveEdit', async () => {
    const onSaveEdit = vi.fn()
    render(<CaseDrawer {...viewProps} onSaveEdit={onSaveEdit} />)
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }))

    expect(screen.getByLabelText(/priority/i)).toHaveValue('high')
    expect(screen.getByLabelText(/^tags/i)).toHaveValue('smoke, regression')
    expect(screen.getByLabelText(/platform/i)).toHaveValue('web')
    expect(screen.getByLabelText(/test type/i)).toHaveValue('e2e')
    expect(screen.getByLabelText(/automated/i)).toBeChecked()

    await userEvent.selectOptions(screen.getByLabelText(/priority/i), 'low')
    await userEvent.click(screen.getByLabelText(/automated/i))
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSaveEdit).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'low', automated: false, platform: 'web', testType: 'e2e' }),
    )
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
