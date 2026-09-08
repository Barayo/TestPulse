import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepGroupsCard } from './StepGroupsCard'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockPUT = vi.mocked(api.PUT)
const mockDELETE = vi.mocked(api.DELETE)

const loginGroup = {
  id: 'sg1',
  key: 'SP-SG1',
  name: 'Log in as admin',
  steps: [{ action: 'open login page' }, { action: 'enter credentials' }],
  createdAt: '',
  updatedAt: '2026-01-01T00:00:00Z',
}

function mockGroupsAPI(groups: unknown[] = [loginGroup]) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}/step-groups') return Promise.resolve({ data: groups, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('StepGroupsCard', () => {
  it('lists existing shared step groups', async () => {
    mockGroupsAPI()
    render(<StepGroupsCard projectKey="SP" />)
    expect(await screen.findByText('Log in as admin')).toBeInTheDocument()
    expect(screen.getByText('2 steps')).toBeInTheDocument()
  })

  it('shows a real empty state when there are no groups', async () => {
    mockGroupsAPI([])
    render(<StepGroupsCard projectKey="SP" />)
    expect(await screen.findByText(/no shared step groups yet/i)).toBeInTheDocument()
  })

  it('expanding a row shows its steps in a bare (no extra Card) editor', async () => {
    mockGroupsAPI()
    render(<StepGroupsCard projectKey="SP" />)
    await userEvent.click(await screen.findByText('Log in as admin'))
    expect(await screen.findByDisplayValue('open login page')).toBeInTheDocument()
    expect(screen.getByDisplayValue('enter credentials')).toBeInTheDocument()
  })

  it('creates a new group with a name and a step typed into the step editor', async () => {
    mockGroupsAPI([])
    mockPOST.mockResolvedValue({ data: { ...loginGroup, id: 'sg2', name: 'New group' }, response: { ok: true } })
    render(<StepGroupsCard projectKey="SP" />)
    await screen.findByText(/no shared step groups yet/i)
    await userEvent.click(screen.getByRole('button', { name: /new group/i }))
    await userEvent.type(screen.getByLabelText(/group name/i), 'New group')
    await userEvent.type(screen.getByLabelText(/^action for step 1/i), 'Open the login page')
    await userEvent.click(screen.getByRole('button', { name: /^create group$/i }))
    expect(mockPOST).toHaveBeenCalledWith('/api/v1/projects/{projectKey}/step-groups', {
      params: { path: { projectKey: 'SP' } },
      body: { name: 'New group', steps: [{ action: 'Open the login page', expected: '' }] },
    })
  })

  it('disables Create group until a name and at least one non-blank step are entered', async () => {
    mockGroupsAPI([])
    render(<StepGroupsCard projectKey="SP" />)
    await screen.findByText(/no shared step groups yet/i)
    await userEvent.click(screen.getByRole('button', { name: /new group/i }))
    expect(screen.getByRole('button', { name: /^create group$/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/group name/i), 'New group')
    expect(screen.getByRole('button', { name: /^create group$/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/^action for step 1/i), 'Do something')
    expect(screen.getByRole('button', { name: /^create group$/i })).toBeEnabled()
  })

  it('shows an error message when creating a group fails', async () => {
    mockGroupsAPI([])
    mockPOST.mockResolvedValue({ error: { error: 'a group with that name already exists' }, response: { ok: false } })
    render(<StepGroupsCard projectKey="SP" />)
    await screen.findByText(/no shared step groups yet/i)
    await userEvent.click(screen.getByRole('button', { name: /new group/i }))
    await userEvent.type(screen.getByLabelText(/group name/i), 'New group')
    await userEvent.type(screen.getByLabelText(/^action for step 1/i), 'Do something')
    await userEvent.click(screen.getByRole('button', { name: /^create group$/i }))
    expect(await screen.findByText(/a group with that name already exists/i)).toBeInTheDocument()
  })

  it('renames a group via its pencil control, resending its current steps', async () => {
    mockGroupsAPI()
    mockPUT.mockResolvedValue({ data: { ...loginGroup, name: 'Renamed' }, response: { ok: true } })
    render(<StepGroupsCard projectKey="SP" />)
    await screen.findByText('Log in as admin')
    await userEvent.click(screen.getByLabelText(/rename log in as admin/i))
    const input = screen.getByDisplayValue('Log in as admin')
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed{Enter}')
    await waitFor(() =>
      expect(mockPUT).toHaveBeenCalledWith('/api/v1/step-groups/{groupId}', {
        params: { path: { groupId: 'sg1' } },
        body: { name: 'Renamed', steps: loginGroup.steps },
      }),
    )
  })

  it('stages step edits locally and only saves them when Save changes is clicked', async () => {
    mockGroupsAPI()
    mockPUT.mockResolvedValue({ data: { ...loginGroup, steps: [{ action: 'open login page!' }, { action: 'enter credentials' }] }, response: { ok: true } })
    render(<StepGroupsCard projectKey="SP" />)
    await userEvent.click(await screen.findByText('Log in as admin'))
    await userEvent.type(await screen.findByDisplayValue('open login page'), '!')
    expect(mockPUT).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(mockPUT).toHaveBeenCalledWith('/api/v1/step-groups/{groupId}', {
        params: { path: { groupId: 'sg1' } },
        body: { name: 'Log in as admin', steps: [{ action: 'open login page!' }, { action: 'enter credentials' }] },
      }),
    )
  })

  it('Cancel on the step editor discards staged edits without saving', async () => {
    mockGroupsAPI()
    render(<StepGroupsCard projectKey="SP" />)
    await userEvent.click(await screen.findByText('Log in as admin'))
    const field = await screen.findByDisplayValue('open login page')
    await userEvent.type(field, '!')
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(mockPUT).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('open login page')).toBeInTheDocument()
  })

  it('shows an error message when saving group step edits fails', async () => {
    mockGroupsAPI()
    mockPUT.mockResolvedValue({ error: { error: 'could not save group' }, response: { ok: false } })
    render(<StepGroupsCard projectKey="SP" />)
    await userEvent.click(await screen.findByText('Log in as admin'))
    await userEvent.type(await screen.findByDisplayValue('open login page'), '!')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByText(/could not save group/i)).toBeInTheDocument()
  })

  it('deleting a group shows an explanatory confirmation (not a live case count) and calls DELETE on confirm', async () => {
    mockGroupsAPI()
    mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
    render(<StepGroupsCard projectKey="SP" />)
    await screen.findByText('Log in as admin')
    await userEvent.click(screen.getByLabelText(/delete log in as admin/i))
    expect(await screen.findByText(/delete "log in as admin"/i)).toBeInTheDocument()
    expect(screen.getByText(/keep their own saved copy/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /delete group/i }))
    expect(mockDELETE).toHaveBeenCalledWith('/api/v1/step-groups/{groupId}', { params: { path: { groupId: 'sg1' } } })
  })
})
