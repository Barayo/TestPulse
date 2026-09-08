import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssignDialog } from './AssignDialog'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn() } }))
const mockGET = vi.mocked(api.GET)

function mockMembersAPI() {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}/members')
      return Promise.resolve({
        data: { users: [{ userId: 'u1', roleId: 'r1' }], teams: [{ teamId: 't1', roleId: 'r1' }] },
        response: { ok: true },
      })
    if (path === '/api/v1/users')
      return Promise.resolve({
        data: {
          items: [
            { id: 'u1', email: 'ana@example.com', isTenantAdmin: false, createdAt: '' },
            { id: 'u2', email: 'outsider@example.com', isTenantAdmin: false, createdAt: '' },
          ],
          nextCursor: null,
        },
        response: { ok: true },
      })
    if (path === '/api/v1/teams')
      return Promise.resolve({
        data: { items: [{ id: 't1', name: 'QA Core', memberIds: [], createdAt: '' }], nextCursor: null },
        response: { ok: true },
      })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AssignDialog', () => {
  it('lists the project\'s members, people and teams separately labeled, no free-text input', async () => {
    mockMembersAPI()
    render(<AssignDialog open onOpenChange={() => {}} projectKey="p1" onAssign={() => {}} />)

    expect(await screen.findByRole('button', { name: 'ana@example.com' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'QA Core' })).toBeInTheDocument()
    expect(screen.queryByText('outsider@example.com')).not.toBeInTheDocument()
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('Teams')).toBeInTheDocument()
  })

  it('calls onAssign with the picked user and closes', async () => {
    mockMembersAPI()
    const onAssign = vi.fn()
    const onOpenChange = vi.fn()
    render(<AssignDialog open onOpenChange={onOpenChange} projectKey="p1" onAssign={onAssign} />)

    await userEvent.click(await screen.findByRole('button', { name: 'ana@example.com' }))

    expect(onAssign).toHaveBeenCalledWith({ kind: 'user', id: 'u1', label: 'ana@example.com' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onAssign with the picked team', async () => {
    mockMembersAPI()
    const onAssign = vi.fn()
    render(<AssignDialog open onOpenChange={() => {}} projectKey="p1" onAssign={onAssign} />)

    await userEvent.click(await screen.findByRole('button', { name: 'QA Core' }))

    expect(onAssign).toHaveBeenCalledWith({ kind: 'team', id: 't1', label: 'QA Core' })
  })

  it('search narrows the list', async () => {
    mockMembersAPI()
    render(<AssignDialog open onOpenChange={() => {}} projectKey="p1" onAssign={() => {}} />)
    await screen.findByRole('button', { name: 'ana@example.com' })

    await userEvent.type(screen.getByPlaceholderText(/search/i), 'qa')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'ana@example.com' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'QA Core' })).toBeInTheDocument()
  })
})
