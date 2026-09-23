import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WebhooksCard } from './WebhooksCard'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }))
const mockGET = vi.mocked(api.GET)
const mockPOST = vi.mocked(api.POST)
const mockDELETE = vi.mocked(api.DELETE)

const dest = { id: 'w1', projectId: 'p1', url: 'https://hooks.slack.com/services/T00/B00/xyz', createdAt: '' }

function mockWebhooksAPI(destinations: unknown[] = []) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/api/v1/projects/{projectKey}/webhooks') return Promise.resolve({ data: destinations, response: { ok: true } })
    return Promise.resolve({ data: undefined, response: { ok: true } })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('WebhooksCard', () => {
  it('shows an empty state when the project has no webhooks configured', async () => {
    mockWebhooksAPI([])
    render(<WebhooksCard projectKey="p1" />)
    expect(await screen.findByText(/no webhook destinations yet/i)).toBeInTheDocument()
  })

  it('lists configured destinations', async () => {
    mockWebhooksAPI([dest])
    render(<WebhooksCard projectKey="p1" />)
    expect(await screen.findByText(dest.url)).toBeInTheDocument()
  })

  it('adds a new destination', async () => {
    mockWebhooksAPI([])
    mockPOST.mockResolvedValue({ data: dest, response: { ok: true } })
    render(<WebhooksCard projectKey="p1" />)
    await screen.findByText(/no webhook destinations yet/i)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/webhook url/i), dest.url)
    await user.click(screen.getByRole('button', { name: /add/i }))

    expect(mockPOST).toHaveBeenCalledWith('/api/v1/projects/{projectKey}/webhooks', {
      params: { path: { projectKey: 'p1' } },
      body: { url: dest.url },
    })
  })

  it('removes a destination', async () => {
    mockWebhooksAPI([dest])
    mockDELETE.mockResolvedValue({ data: undefined, response: { ok: true } })
    render(<WebhooksCard projectKey="p1" />)
    await screen.findByText(dest.url)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: new RegExp(`remove ${dest.url}`, 'i') }))

    expect(mockDELETE).toHaveBeenCalledWith('/api/v1/webhooks/{webhookId}', {
      params: { path: { webhookId: dest.id } },
    })
  })
})
