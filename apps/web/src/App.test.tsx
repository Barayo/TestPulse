import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'
import { api } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() },
}))

const mockGET = vi.mocked(api.GET)

function mockReadyz(ok: boolean) {
  mockGET.mockImplementation((path: string) => {
    if (path === '/readyz') {
      return Promise.resolve({ response: { ok } })
    }
    if (path === '/api/v1/meta') {
      return Promise.resolve({
        response: { ok: true },
        data: { name: 'TestPulse', version: '0.0.1' },
      })
    }
    // ProjectsPage's own data fetch (irrelevant to these health-badge tests).
    return Promise.resolve({ response: { ok: true }, data: [] })
  })
}

beforeEach(() => {
  mockGET.mockReset()
})

describe('App health status', () => {
  it('shows "System ready" when the API readiness check succeeds', async () => {
    mockReadyz(true)
    render(<App />)
    expect(await screen.findByText('System ready')).toBeInTheDocument()
  })

  it('shows the API version once loaded', async () => {
    mockReadyz(true)
    render(<App />)
    expect(await screen.findByText('v0.0.1')).toBeInTheDocument()
  })

  it('shows "API unavailable" when readiness returns an error status', async () => {
    mockReadyz(false)
    render(<App />)
    expect(await screen.findByText('API unavailable')).toBeInTheDocument()
  })

  it('shows "API unavailable" when the API cannot be reached at all', async () => {
    mockGET.mockRejectedValue(new Error('network down'))
    render(<App />)
    expect(await screen.findByText('API unavailable')).toBeInTheDocument()
  })

  it('shows a checking state while the request is in flight', () => {
    mockGET.mockReturnValue(new Promise(() => {})) // never resolves
    render(<App />)
    expect(screen.getByText('Checking…')).toBeInTheDocument()
  })
})

describe('App shell', () => {
  it('renders the product title and the projects page at /', async () => {
    mockReadyz(true)
    render(<App />)
    expect(screen.getByText('TestPulse')).toBeInTheDocument()
    expect(await screen.findByText('New project')).toBeInTheDocument()
    await screen.findByText('System ready') // avoid act() warnings
  })
})
