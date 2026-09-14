import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaseStepsList } from './CaseStepsList'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)

const loginGroup = {
  id: 'sg1',
  key: 'SP-SG1',
  name: 'Log in as admin',
  steps: [{ action: 'open login page' }, { action: 'enter credentials' }],
  createdAt: '',
  updatedAt: '2026-01-01T00:00:00Z',
}

function mockStepGroupsAPI(overrides: { group?: object | null; list?: object[] } = {}) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/step-groups/{groupId}') {
      if (overrides.group === null) return Promise.resolve({ data: undefined, response: { ok: false, status: 404 } })
      return Promise.resolve({ data: overrides.group ?? loginGroup, response: { ok: true } })
    }
    if (path === '/api/v1/projects/{projectKey}/step-groups') {
      return Promise.resolve({ data: overrides.list ?? [loginGroup], response: { ok: true } })
    }
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('CaseStepsList', () => {
  it('renders a numbered badge and action text per step', () => {
    render(
      <CaseStepsList
        steps={[
          { action: 'open login page', expected: 'form visible' },
          { action: 'submit credentials' },
        ]}
      />,
    )
    expect(screen.getByTestId('step-number-0')).toHaveTextContent('1')
    expect(screen.getByTestId('step-number-1')).toHaveTextContent('2')
    expect(screen.getByText('open login page')).toBeInTheDocument()
    expect(screen.getByText('submit credentials')).toBeInTheDocument()
  })

  it('renders a per-step expected-result callout when present', () => {
    render(<CaseStepsList steps={[{ action: 'open login page', expected: 'form visible' }]} />)
    expect(screen.getByText('Expected:')).toBeInTheDocument()
    expect(screen.getByText('form visible')).toBeInTheDocument()
  })

  it('does not render a callout for a step with no expected result', () => {
    render(<CaseStepsList steps={[{ action: 'just do it' }]} />)
    expect(screen.queryByText('Expected:')).not.toBeInTheDocument()
  })

  it('shows a real empty state, not a bare sentence, when there are no steps', () => {
    render(<CaseStepsList steps={[]} />)
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument()
    expect(screen.getByText(/add steps to describe how to run this test/i)).toBeInTheDocument()
  })

  it('treats undefined steps the same as an empty list', () => {
    render(<CaseStepsList steps={undefined} />)
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument()
  })

  it('does not render any call-to-action in the empty state by default', () => {
    render(<CaseStepsList steps={[]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders a provided emptyStateAction inside the empty state', () => {
    render(<CaseStepsList steps={[]} emptyStateAction={<button>+ Add steps</button>} />)
    expect(screen.getByRole('button', { name: '+ Add steps' })).toBeInTheDocument()
  })

  it('tints a {placeholder} matching a known parameter column (add-parameterized-cases)', () => {
    render(
      <CaseStepsList
        steps={[{ action: 'Enter {username}', expected: '{username} is logged in' }]}
        parameterColumns={['username']}
      />,
    )
    expect(screen.getAllByText('{username}', { selector: '.text-primary' })).toHaveLength(2)
  })

  it('leaves literal braces untinted when they do not match a known parameter column', () => {
    render(<CaseStepsList steps={[{ action: 'Enter a value like {this}' }]} parameterColumns={['username']} />)
    expect(screen.queryByText('{this}', { selector: '.text-primary' })).not.toBeInTheDocument()
    expect(screen.getByText('Enter a value like {this}')).toBeInTheDocument()
  })

  it('does not tint anything when no parameterColumns are given', () => {
    render(<CaseStepsList steps={[{ action: 'Enter {username}' }]} />)
    expect(screen.queryByText('{username}', { selector: '.text-primary' })).not.toBeInTheDocument()
  })
})

describe('CaseStepsList — editable (in-place edit, add-case-authoring-formats)', () => {
  it('renders editable action/expected fields inside the same card shape as read mode, when onChange is provided', () => {
    render(
      <CaseStepsList
        steps={[{ action: 'open login page', expected: 'form visible' }]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('step-number-0')).toHaveTextContent('1')
    expect(screen.getByLabelText(/^action for step 1/i)).toHaveValue('open login page')
    expect(screen.getByLabelText(/^expected result for step 1/i)).toHaveValue('form visible')
  })

  it('reports an edited action via onChange', async () => {
    const onChange = vi.fn()
    render(<CaseStepsList steps={[{ action: 'open login page', expected: '' }]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText(/^action for step 1/i), '!')
    expect(onChange).toHaveBeenCalledWith([{ action: 'open login page!', expected: '' }])
  })

  it('removes a step via its remove control', async () => {
    const onChange = vi.fn()
    render(
      <CaseStepsList
        steps={[
          { action: 'first', expected: '' },
          { action: 'second', expected: '' },
        ]}
        onChange={onChange}
      />,
    )
    await userEvent.click(screen.getByLabelText(/remove step 1/i))
    expect(onChange).toHaveBeenCalledWith([{ action: 'second', expected: '' }])
  })

  it('adds a step via an in-card "+ Add step" control', async () => {
    const onChange = vi.fn()
    render(<CaseStepsList steps={[{ action: 'first', expected: '' }]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /add step/i }))
    expect(onChange).toHaveBeenCalledWith([
      { action: 'first', expected: '' },
      { action: '', expected: '' },
    ])
  })

  it('renders the card (with an Add step control) rather than the empty state when editable with zero steps', () => {
    render(<CaseStepsList steps={[]} onChange={vi.fn()} />)
    expect(screen.queryByText(/no steps yet/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add step/i })).toBeInTheDocument()
  })
})

describe('CaseStepsList — shared step groups, editable (add-reusable-steps)', () => {
  const groupSteps = [
    { action: 'plain step one' },
    {
      action: 'open login page',
      groupRef: { groupId: 'sg1', groupKey: 'SP-SG1', snapshotUpdatedAt: '2026-01-01T00:00:00Z' },
    },
    {
      action: 'enter credentials',
      groupRef: { groupId: 'sg1', groupKey: 'SP-SG1', snapshotUpdatedAt: '2026-01-01T00:00:00Z' },
    },
    { action: 'plain step two' },
  ]

  it('renders a contiguous run sharing one groupRef as a single block with a range badge and the fetched group name', async () => {
    mockStepGroupsAPI()
    render(<CaseStepsList steps={groupSteps} onChange={vi.fn()} projectKey="SP" />)
    expect(await screen.findByText('Log in as admin')).toBeInTheDocument()
    expect(screen.getByText('2–3')).toBeInTheDocument()
    expect(screen.getByText('plain step one')).toBeInTheDocument()
    expect(screen.getByText('plain step two')).toBeInTheDocument()
  })

  it('does not show a staleness pill when the snapshot matches the group\'s current updatedAt', async () => {
    mockStepGroupsAPI()
    render(<CaseStepsList steps={groupSteps} onChange={vi.fn()} projectKey="SP" />)
    await screen.findByText('Log in as admin')
    expect(screen.queryByText(/update available/i)).not.toBeInTheDocument()
  })

  it('shows an "Update available" pill and a Refresh action when the group has changed since the snapshot', async () => {
    mockStepGroupsAPI({ group: { ...loginGroup, updatedAt: '2026-06-01T00:00:00Z', steps: [{ action: 'new step content' }] } })
    render(<CaseStepsList steps={groupSteps} onChange={vi.fn()} projectKey="SP" />)
    expect(await screen.findByText(/update available/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
  })

  it('refreshing replaces the block\'s steps with the group\'s current content and updates the snapshot', async () => {
    const onChange = vi.fn()
    mockStepGroupsAPI({ group: { ...loginGroup, updatedAt: '2026-06-01T00:00:00Z', steps: [{ action: 'new step content' }] } })
    render(<CaseStepsList steps={groupSteps} onChange={onChange} projectKey="SP" />)
    await userEvent.click(await screen.findByRole('button', { name: /refresh/i }))
    expect(onChange).toHaveBeenCalledWith([
      { action: 'plain step one' },
      {
        action: 'new step content',
        expected: undefined,
        groupRef: { groupId: 'sg1', groupKey: 'SP-SG1', snapshotUpdatedAt: '2026-06-01T00:00:00Z' },
      },
      { action: 'plain step two' },
    ])
  })

  it('shows a "Source group deleted" state with only Detach, no Refresh, when the group no longer exists', async () => {
    mockStepGroupsAPI({ group: null })
    render(<CaseStepsList steps={groupSteps} onChange={vi.fn()} projectKey="SP" />)
    expect(await screen.findByText(/source group deleted/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /detach/i })).toBeInTheDocument()
  })

  it('detaching converts the block into plain, independently editable steps', async () => {
    const onChange = vi.fn()
    mockStepGroupsAPI()
    render(<CaseStepsList steps={groupSteps} onChange={onChange} projectKey="SP" />)
    await userEvent.click(await screen.findByRole('button', { name: /detach/i }))
    expect(onChange).toHaveBeenCalledWith([
      { action: 'plain step one' },
      { action: 'open login page', expected: undefined },
      { action: 'enter credentials', expected: undefined },
      { action: 'plain step two' },
    ])
  })

  it('inserting a shared group via the picker appends its expanded steps', async () => {
    const onChange = vi.fn()
    mockStepGroupsAPI({ list: [loginGroup] })
    render(<CaseStepsList steps={[{ action: 'first' }]} onChange={onChange} projectKey="SP" />)
    await userEvent.click(screen.getByRole('button', { name: /insert shared group/i }))
    await userEvent.click(await screen.findByText('Log in as admin'))
    expect(onChange).toHaveBeenCalledWith([
      { action: 'first' },
      {
        action: 'open login page',
        expected: undefined,
        groupRef: { groupId: 'sg1', groupKey: 'SP-SG1', snapshotUpdatedAt: '2026-01-01T00:00:00Z' },
      },
      {
        action: 'enter credentials',
        expected: undefined,
        groupRef: { groupId: 'sg1', groupKey: 'SP-SG1', snapshotUpdatedAt: '2026-01-01T00:00:00Z' },
      },
    ])
  })

  it('disables inserting a group that is already the block immediately before it, to avoid a silent contiguous-merge on save', async () => {
    const onChange = vi.fn()
    mockStepGroupsAPI({ list: [loginGroup] })
    render(
      <CaseStepsList
        steps={[
          { action: 'first' },
          { action: 'open login page', groupRef: { groupId: 'sg1', groupKey: 'SP-SG1', snapshotUpdatedAt: '2026-01-01T00:00:00Z' } },
          { action: 'enter credentials', groupRef: { groupId: 'sg1', groupKey: 'SP-SG1', snapshotUpdatedAt: '2026-01-01T00:00:00Z' } },
        ]}
        onChange={onChange}
        projectKey="SP"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /insert shared group/i }))
    const option = await screen.findByRole('button', { name: /log in as admin/i })
    expect(option).toBeDisabled()
    expect(screen.getByText(/already referenced directly above/i)).toBeInTheDocument()
    await userEvent.click(option)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('still allows inserting a different, non-adjacent group normally', async () => {
    const onChange = vi.fn()
    mockStepGroupsAPI({ list: [loginGroup] })
    render(<CaseStepsList steps={[{ action: 'first' }]} onChange={onChange} projectKey="SP" />)
    await userEvent.click(screen.getByRole('button', { name: /insert shared group/i }))
    const option = await screen.findByRole('button', { name: /log in as admin/i })
    expect(option).toBeEnabled()
    await userEvent.click(option)
    expect(onChange).toHaveBeenCalled()
  })

  it('selecting a contiguous run of plain steps and extracting creates a group and replaces the selection', async () => {
    const onChange = vi.fn()
    mockGET.mockResolvedValue({ data: undefined, response: { ok: true } })
    mockPOST.mockResolvedValue({
      data: { id: 'sg2', key: 'SP-SG2', name: 'New shared bit', steps: [{ action: 'a' }, { action: 'b' }], createdAt: '', updatedAt: '2026-02-01T00:00:00Z' },
      response: { ok: true },
    })
    render(
      <CaseStepsList
        steps={[{ action: 'a' }, { action: 'b' }, { action: 'c' }]}
        onChange={onChange}
        projectKey="SP"
      />,
    )
    await userEvent.click(screen.getByTestId('step-number-0'))
    fireEvent.click(screen.getByTestId('step-number-1'), { shiftKey: true })
    await userEvent.click(screen.getByRole('button', { name: /extract as shared group/i }))
    await userEvent.type(screen.getByLabelText(/group name/i), 'New shared bit')
    await userEvent.click(screen.getByRole('button', { name: /create group/i }))
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        {
          action: 'a',
          expected: undefined,
          groupRef: { groupId: 'sg2', groupKey: 'SP-SG2', snapshotUpdatedAt: '2026-02-01T00:00:00Z' },
        },
        {
          action: 'b',
          expected: undefined,
          groupRef: { groupId: 'sg2', groupKey: 'SP-SG2', snapshotUpdatedAt: '2026-02-01T00:00:00Z' },
        },
        { action: 'c' },
      ]),
    )
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/projects/{projectKey}/step-groups', {
      params: { path: { projectKey: 'SP' } },
      body: { name: 'New shared bit', steps: [{ action: 'a' }, { action: 'b' }] },
    })
  })
})

describe('CaseStepsList — shared step groups, read-only (add-reusable-steps)', () => {
  it('shows a "From shared group" caption with no interactive actions', async () => {
    const group = {
      id: 'sg1',
      key: 'SP-SG1',
      name: 'Log in as admin',
      steps: [],
      createdAt: '',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    mockStepGroupsAPI({ group })
    render(
      <CaseStepsList
        steps={[
          {
            action: 'open login page',
            groupRef: { groupId: 'sg1', groupKey: 'SP-SG1', snapshotUpdatedAt: '2026-01-01T00:00:00Z' },
          },
        ]}
      />,
    )
    const caption = await screen.findByText(/from shared group/i)
    expect(within(caption.closest('div')!).getByRole('link', { name: 'Log in as admin' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /detach/i })).not.toBeInTheDocument()
  })
})
