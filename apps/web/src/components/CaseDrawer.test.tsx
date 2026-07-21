import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

