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
      description: '',
      format: 'steps',
      gherkinSource: '',
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
      description: '',
      format: 'steps',
      gherkinSource: '',
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
      description: '',
      format: 'steps',
      gherkinSource: '',
      priority: 'critical',
      tags: ['smoke', 'regression'],
      platform: 'web',
      testType: 'e2e',
      automated: true,
    })
  })
})

describe('CaseDrawer — content format', () => {
  it('defaults to Steps format with all three options visible', () => {
    render(<CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={vi.fn()} />)
    const group = screen.getByRole('group', { name: /format/i })
    expect(within(group).getByRole('button', { name: /steps/i })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: /free text/i })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group).getByRole('button', { name: /gherkin/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByLabelText(/^action for step/i)).toHaveLength(1)
  })

  it('switching to Free text hides the step editor and shows a description field', async () => {
    const onCreate = vi.fn()
    render(<CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={onCreate} />)
    await userEvent.click(screen.getByRole('button', { name: /free text/i }))
    expect(screen.queryByLabelText(/^action for step/i)).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/title/i), 'Explore checkout')
    await userEvent.type(screen.getByLabelText(/description/i), 'Walk through checkout as a guest.')
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Explore checkout',
      steps: [],
      description: 'Walk through checkout as a guest.',
      format: 'text',
      gherkinSource: '',
      priority: 'medium',
      tags: [],
      platform: '',
      testType: '',
      automated: false,
    })
  })

  it('switching to Gherkin hides the step editor and shows the scenario field', async () => {
    const onCreate = vi.fn()
    render(<CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={onCreate} />)
    await userEvent.click(screen.getByRole('button', { name: /gherkin/i }))
    expect(screen.queryByLabelText(/^action for step/i)).not.toBeInTheDocument()

    const source = 'Given a user\nWhen they log in\nThen they see the dashboard'
    await userEvent.type(screen.getByLabelText(/title/i), 'Login BDD')
    await userEvent.type(screen.getByLabelText(/scenario/i), source)
    await userEvent.click(screen.getByRole('button', { name: /create test case/i }))

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Login BDD',
      steps: [],
      description: '',
      format: 'gherkin',
      gherkinSource: source,
      priority: 'medium',
      tags: [],
      platform: '',
      testType: '',
      automated: false,
    })
  })

  it('warns before switching away from a format with unsaved content, and cancel keeps it', async () => {
    render(<CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={vi.fn()} />)
    const actionInputs = screen.getAllByLabelText(/^action for step/i)
    await userEvent.type(actionInputs[0], 'Some step')

    await userEvent.click(screen.getByRole('button', { name: /free text/i }))
    expect(screen.getByRole('dialog', { name: /switch to free text/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.getAllByLabelText(/^action for step/i)[0]).toHaveValue('Some step')
  })

  it('confirming the switch clears the abandoned format content', async () => {
    render(<CaseDrawer mode="create" open folderName="Transferencias" onClose={vi.fn()} onCreate={vi.fn()} />)
    const actionInputs = screen.getAllByLabelText(/^action for step/i)
    await userEvent.type(actionInputs[0], 'Some step')

    await userEvent.click(screen.getByRole('button', { name: /free text/i }))
    await userEvent.click(screen.getByRole('button', { name: /switch format/i }))
    expect(screen.getByLabelText(/description/i)).toHaveValue('')

    await userEvent.click(screen.getByRole('button', { name: /^steps$/i }))
    expect(screen.getAllByLabelText(/^action for step/i)[0]).toHaveValue('')
  })
})

